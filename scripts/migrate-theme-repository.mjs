import { appendFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { githubRepositoryKey, parseGitHubRepository } from "./github-repository.mjs";
import { themeSlugFromRepository } from "./theme-domain.mjs";
import {
  parseThemeRepositoryIdentity,
  resolveThemeRepositoryMigrationIdentity,
  validateThemeRepositoryMigrations,
} from "./theme-repository-identity.mjs";
import { validateCommunityThemeSource } from "./theme-source-validation.mjs";

const fullCommitPattern = /^[0-9a-f]{40}$/i;

function strictIsoTimestamp(value, field) {
  if (typeof value !== "string") throw new Error(`${field} must be an ISO timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return timestamp;
}

function sourceForTheme(registry, themeId) {
  const matches = registry.sources.filter((source) => themeSlugFromRepository(source.repo) === themeId);
  if (matches.length !== 1) throw new Error(`Theme is not one unambiguous active source: ${themeId}`);
  return matches[0];
}

function catalogThemeForSource(catalog, themeId, source) {
  const matches = catalog.themes.filter((theme) => theme.id === themeId);
  if (matches.length !== 1
    || matches[0].sourceType !== "community"
    || githubRepositoryKey(matches[0].repo) !== githubRepositoryKey(source.repo)) {
    throw new Error("Theme migration catalog evidence is ambiguous");
  }
  return matches[0];
}

function bindHistoricalRepository(source, field, repository, allowedRepositories) {
  const commitField = `${field}Commit`;
  const repositoryField = `${field}Repository`;
  if (!source[commitField]) return source;
  if (!fullCommitPattern.test(source[commitField])) {
    throw new Error(`Theme migration cannot preserve invalid ${field} evidence`);
  }
  if (source[repositoryField]
    && !allowedRepositories.has(githubRepositoryKey(source[repositoryField]))) {
    throw new Error(`Theme migration ${field} evidence is bound to another repository`);
  }
  return source[repositoryField] ? source : { ...source, [repositoryField]: repository };
}

export function planThemeRepositoryMigration(registry, catalog, input, observation, validation) {
  if (registry?.schemaVersion !== 1
    || !Array.isArray(registry.sources)
    || !Array.isArray(registry.repositoryMigrations)
    || catalog?.schemaVersion !== 1
    || !Array.isArray(catalog.themes)) {
    throw new Error("Registry and catalog must use the current theme marketplace schema");
  }
  validateThemeRepositoryMigrations(registry);
  const source = sourceForTheme(registry, input.themeId);
  const previousTheme = catalogThemeForSource(catalog, input.themeId, source);
  const from = parseGitHubRepository(source.repo);
  const to = parseGitHubRepository(input.newRepository);
  if (githubRepositoryKey(source.repo) === githubRepositoryKey(input.newRepository)) {
    throw new Error("Theme repository migration requires a different canonical path");
  }
  if (themeSlugFromRepository(input.newRepository) !== input.themeId) {
    throw new Error("Theme repository migration must preserve the installed Omarchy theme ID");
  }
  if (registry.sources.some((candidate) => githubRepositoryKey(candidate.repo) === githubRepositoryKey(input.newRepository))) {
    throw new Error("Theme repository migration target is already an active source");
  }
  if (!fullCommitPattern.test(previousTheme.checkedCommit || "")) {
    throw new Error("Theme migration previous catalog commit is invalid");
  }
  strictIsoTimestamp(previousTheme.checkedAt, "Previous catalog checkedAt");

  if (observation.fromRepository.toLowerCase() !== from.slug.toLowerCase()
    || observation.toRepository.toLowerCase() !== to.slug.toLowerCase()
    || !fullCommitPattern.test(observation.observedHeadCommit || "")
    || typeof observation.observedBranch !== "string"
    || !observation.observedBranch
    || !Number.isSafeInteger(observation.databaseId)
    || typeof observation.nodeId !== "string") {
    throw new Error("Theme migration identity observation does not match the requested paths");
  }
  if (strictIsoTimestamp(observation.observedAt, "Migration observedAt")
    <= strictIsoTimestamp(catalog.generatedAt, "Catalog generatedAt")) {
    throw new Error("Theme migration observation must be newer than the catalog");
  }
  const existingIdentity = parseThemeRepositoryIdentity(source.repositoryIdentity);
  if (existingIdentity && (existingIdentity.nodeId !== observation.nodeId
    || existingIdentity.databaseId !== observation.databaseId)) {
    throw new Error("Theme migration conflicts with the stored immutable repository identity");
  }

  if (validation.themeId !== input.themeId
    || githubRepositoryKey(validation.repository) !== githubRepositoryKey(input.newRepository)
    || validation.commit.toLowerCase() !== observation.observedHeadCommit.toLowerCase()
    || validation.branch !== observation.observedBranch) {
    throw new Error("Theme migration validation does not match the observed canonical HEAD");
  }

  const allowedEvidenceRepositories = new Set([
    githubRepositoryKey(source.repo),
    ...(existingIdentity?.previousRepositories || []).map((repository) => (
      githubRepositoryKey(`https://github.com/${repository}`)
    )),
  ]);
  let normalizedSource = bindHistoricalRepository(
    source,
    "listingApproved",
    source.repo,
    allowedEvidenceRepositories,
  );
  normalizedSource = bindHistoricalRepository(
    normalizedSource,
    "listingUpdated",
    source.repo,
    allowedEvidenceRepositories,
  );
  const previousRepositories = [
    ...(existingIdentity?.previousRepositories || []),
    from.slug,
  ];
  if (new Set(previousRepositories.map((repository) => repository.toLowerCase())).size !== previousRepositories.length) {
    throw new Error("Theme migration repeats a historical repository path");
  }
  const nextSource = {
    ...normalizedSource,
    repo: `https://github.com/${to.slug}`,
    repositoryIdentity: {
      schemaVersion: 1,
      nodeId: observation.nodeId,
      databaseId: observation.databaseId,
      previousRepositories,
    },
  };
  const migration = {
    schemaVersion: 1,
    themeId: input.themeId,
    fromRepository: from.slug,
    toRepository: to.slug,
    nodeId: observation.nodeId,
    databaseId: observation.databaseId,
    previousCatalogCommit: previousTheme.checkedCommit,
    observedHeadCommit: observation.observedHeadCommit,
    observedBranch: observation.observedBranch,
    observedAt: observation.observedAt,
  };
  const nextRegistry = {
    ...registry,
    repositoryMigrations: [...registry.repositoryMigrations, migration],
    sources: registry.sources.map((candidate) => candidate === source ? nextSource : candidate),
  };
  validateThemeRepositoryMigrations(nextRegistry);
  const report = {
    schemaVersion: 1,
    themeId: input.themeId,
    fromRepository: source.repo,
    toRepository: nextSource.repo,
    previousCatalogCommit: previousTheme.checkedCommit,
    observedHeadCommit: observation.observedHeadCommit,
    observedBranch: observation.observedBranch,
    observedAt: observation.observedAt,
    nodeId: observation.nodeId,
    databaseId: observation.databaseId,
    ignoredFiles: [...(validation.ignoredFiles || [])],
    warnings: [...(validation.warnings || [])],
    commitSubject: `Migrate ${input.themeId} theme repository`,
  };
  return { source, previousTheme, nextSource, migration, nextRegistry, report };
}

async function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function migrateThemeRepository(options, dependencies = {}) {
  const [registry, catalog] = await Promise.all([
    readFile(options.registryPath, "utf8").then(JSON.parse),
    readFile(options.catalogPath, "utf8").then(JSON.parse),
  ]);
  const source = sourceForTheme(registry, options.themeId);
  const observation = await (dependencies.resolveIdentity || resolveThemeRepositoryMigrationIdentity)(
    source.repo,
    options.newRepository,
  );
  const validation = await (dependencies.validateSource || validateCommunityThemeSource)(
    { ...source, repo: options.newRepository },
    { expectedCommit: observation.observedHeadCommit },
  );
  const result = planThemeRepositoryMigration(registry, catalog, {
    themeId: options.themeId,
    newRepository: options.newRepository,
  }, observation, validation);
  await writeAtomic(options.registryPath, `${JSON.stringify(result.nextRegistry, null, 2)}\n`);
  await writeAtomic(options.reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  return { ...result, observation, validation };
}

async function main() {
  const { values } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      catalog: { type: "string", default: "site/catalog.json" },
      report: { type: "string" },
    },
    strict: true,
  });
  if (!values.report) throw new Error("--report is required");
  const result = await migrateThemeRepository({
    registryPath: resolve(values.registry),
    catalogPath: resolve(values.catalog),
    reportPath: resolve(values.report),
    themeId: process.env.MARKETPLACE_MIGRATION_THEME_ID || "",
    newRepository: process.env.MARKETPLACE_MIGRATION_NEW_REPOSITORY || "",
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, [
      `from_repository=${result.report.fromRepository}`,
      `repository=${result.report.toRepository}`,
      `commit=${result.report.observedHeadCommit}`,
      `theme_id=${result.report.themeId}`,
    ].join("\n") + "\n");
  }
  process.stdout.write(`${JSON.stringify(result.report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}
