import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { githubRepositoryKey } from "./github-repository.mjs";
import { validateThemeRepositoryMigrations } from "./theme-repository-identity.mjs";

function same(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sourceByRepository(registry, repository) {
  const key = githubRepositoryKey(repository);
  const matches = registry.sources.filter((source) => githubRepositoryKey(source.repo) === key);
  if (matches.length !== 1) throw new Error(`Expected exactly one registry source: ${repository}`);
  return matches[0];
}

function themeById(catalog, id) {
  const matches = catalog.themes.filter((theme) => theme.id === id);
  if (matches.length !== 1) throw new Error(`Expected exactly one catalog theme: ${id}`);
  return matches[0];
}

function previewNames(themes) {
  const names = new Set();
  for (const theme of themes) {
    for (const variant of ["card", "detail"]) {
      const path = theme.preview?.[variant];
      if (!/^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path || "")) {
        throw new Error(`Invalid generated preview path for theme: ${theme.id}`);
      }
      names.add(path.split("/").at(-1));
    }
  }
  return names;
}

function withoutMigrationFields(source) {
  const {
    repo: ignoredRepo,
    repositoryIdentity: ignoredIdentity,
    listingApprovedRepository: ignoredApprovalRepository,
    listingUpdatedRepository: ignoredUpdateRepository,
    ...rest
  } = source;
  return rest;
}

export function verifyThemeMigrationProjection(baseRegistry, baseCatalog, nextRegistry, nextCatalog, report, expected) {
  validateThemeRepositoryMigrations(baseRegistry);
  const migrations = validateThemeRepositoryMigrations(nextRegistry);
  if (report?.schemaVersion !== 1
    || report.themeId !== expected.themeId
    || githubRepositoryKey(report.toRepository) !== githubRepositoryKey(expected.newRepository)) {
    throw new Error("Theme migration report does not match the authorized request");
  }
  const migration = migrations.at(-1);
  if (migrations.length !== baseRegistry.repositoryMigrations.length + 1
    || !same(migrations.slice(0, -1), baseRegistry.repositoryMigrations)
    || migration.themeId !== report.themeId
    || githubRepositoryKey(`https://github.com/${migration.fromRepository}`) !== githubRepositoryKey(report.fromRepository)
    || githubRepositoryKey(`https://github.com/${migration.toRepository}`) !== githubRepositoryKey(report.toRepository)
    || migration.nodeId !== report.nodeId
    || migration.databaseId !== report.databaseId
    || migration.previousCatalogCommit !== report.previousCatalogCommit
    || migration.observedHeadCommit !== report.observedHeadCommit
    || migration.observedBranch !== report.observedBranch
    || migration.observedAt !== report.observedAt) {
    throw new Error("Theme migration registry record does not match its report");
  }

  const baseSource = sourceByRepository(baseRegistry, report.fromRepository);
  const nextSource = sourceByRepository(nextRegistry, report.toRepository);
  if (!same(withoutMigrationFields(baseSource), withoutMigrationFields(nextSource))) {
    throw new Error("Theme migration changed source metadata or snapshot evidence");
  }
  if (baseSource.listingApprovedCommit
    && githubRepositoryKey(nextSource.listingApprovedRepository) !== githubRepositoryKey(report.fromRepository)) {
    throw new Error("Theme migration did not bind historical approval evidence to its original repository");
  }
  if (baseSource.listingUpdatedCommit
    && githubRepositoryKey(nextSource.listingUpdatedRepository) !== githubRepositoryKey(report.fromRepository)) {
    throw new Error("Theme migration did not bind historical update evidence to its original repository");
  }
  const baseRegistryState = { ...baseRegistry, sources: undefined, repositoryMigrations: undefined };
  const nextRegistryState = { ...nextRegistry, sources: undefined, repositoryMigrations: undefined };
  if (!same(baseRegistryState, nextRegistryState)) {
    throw new Error("Theme migration changed unrelated registry state");
  }
  const baseUnrelatedSources = baseRegistry.sources.filter((source) => source !== baseSource);
  const nextUnrelatedSources = nextRegistry.sources.filter((source) => source !== nextSource);
  if (!same(baseUnrelatedSources, nextUnrelatedSources)) {
    throw new Error("Theme migration changed an unrelated registry source");
  }

  const baseTheme = themeById(baseCatalog, report.themeId);
  const nextTheme = themeById(nextCatalog, report.themeId);
  if (baseTheme.sourceType !== "community"
    || nextTheme.sourceType !== "community"
    || githubRepositoryKey(baseTheme.repo) !== githubRepositoryKey(report.fromRepository)
    || githubRepositoryKey(nextTheme.repo) !== githubRepositoryKey(report.toRepository)
    || baseTheme.checkedCommit !== report.previousCatalogCommit
    || nextTheme.checkedCommit !== report.observedHeadCommit
    || nextTheme.checkedBranch !== report.observedBranch) {
    throw new Error("Theme migration catalog projection does not match its report");
  }
  const baseUnrelatedThemes = baseCatalog.themes.filter((theme) => theme.id !== report.themeId);
  const nextUnrelatedThemes = nextCatalog.themes.filter((theme) => theme.id !== report.themeId);
  if (!same(baseUnrelatedThemes, nextUnrelatedThemes)) {
    throw new Error("Theme migration changed an unrelated catalog record");
  }
  if (nextCatalog.schemaVersion !== baseCatalog.schemaVersion
    || nextCatalog.mode !== baseCatalog.mode
    || Date.parse(nextCatalog.generatedAt) <= Date.parse(baseCatalog.generatedAt)) {
    throw new Error("Theme migration catalog metadata is invalid");
  }
  const expectedWarnings = nextCatalog.themes
    .filter((theme) => theme.license === "Not declared")
    .map((theme) => `${theme.name}: upstream repository does not declare a license.`);
  if (!same(nextCatalog.warnings, expectedWarnings)) {
    throw new Error("Theme migration warnings are not derived from the final theme set");
  }
  return Object.freeze({
    baseTheme,
    nextTheme,
    unrelatedPreviewNames: previewNames(baseUnrelatedThemes),
    nextPreviewNames: previewNames(nextCatalog.themes),
    replacedPreviewNames: previewNames([baseTheme]),
  });
}

async function verifyPreviewProjection(plan, baseDirectory, nextDirectory) {
  const nextFiles = new Set(await readdir(nextDirectory));
  if (!same([...nextFiles].sort(), [...plan.nextPreviewNames].sort())) {
    throw new Error("Theme migration preview directory does not exactly match the next catalog");
  }
  for (const name of plan.unrelatedPreviewNames) {
    const [before, after] = await Promise.all([
      readFile(resolve(baseDirectory, name)),
      readFile(resolve(nextDirectory, name)),
    ]);
    if (!before.equals(after)) throw new Error(`Theme migration changed an unrelated preview: ${name}`);
  }
  for (const name of plan.replacedPreviewNames) {
    if (!plan.nextPreviewNames.has(name) && nextFiles.has(name)) {
      throw new Error(`Theme migration retained an obsolete target preview: ${name}`);
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "base-registry": { type: "string", default: "registry.json" },
      "base-catalog": { type: "string", default: "site/catalog.json" },
      "base-preview-dir": { type: "string", default: "site/assets/img/themes" },
      "next-registry": { type: "string" },
      "next-catalog": { type: "string" },
      "next-preview-dir": { type: "string" },
      report: { type: "string" },
    },
    strict: true,
  });
  for (const name of ["next-registry", "next-catalog", "next-preview-dir", "report"]) {
    if (!values[name]) throw new Error(`--${name} is required`);
  }
  const [baseRegistry, baseCatalog, nextRegistry, nextCatalog, report] = await Promise.all([
    readFile(resolve(values["base-registry"]), "utf8").then(JSON.parse),
    readFile(resolve(values["base-catalog"]), "utf8").then(JSON.parse),
    readFile(resolve(values["next-registry"]), "utf8").then(JSON.parse),
    readFile(resolve(values["next-catalog"]), "utf8").then(JSON.parse),
    readFile(resolve(values.report), "utf8").then(JSON.parse),
  ]);
  const plan = verifyThemeMigrationProjection(baseRegistry, baseCatalog, nextRegistry, nextCatalog, report, {
    themeId: process.env.MARKETPLACE_MIGRATION_THEME_ID || "",
    newRepository: process.env.MARKETPLACE_MIGRATION_NEW_REPOSITORY || "",
  });
  await verifyPreviewProjection(plan, resolve(values["base-preview-dir"]), resolve(values["next-preview-dir"]));
  process.stdout.write(`Verified exact repository migration for ${plan.nextTheme.id}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}
