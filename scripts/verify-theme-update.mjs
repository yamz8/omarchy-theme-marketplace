import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { githubRepositoryKey } from "./github-repository.mjs";

const fullCommitPattern = /^[0-9a-f]{40}$/i;

function same(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function themeById(catalog, id) {
  const matches = (catalog?.themes || []).filter((theme) => theme.id === id);
  if (matches.length !== 1) throw new Error(`Expected exactly one catalog theme: ${id}`);
  return matches[0];
}

function sourceByRepository(registry, repository) {
  const key = githubRepositoryKey(repository);
  const matches = (registry?.sources || []).filter((source) => githubRepositoryKey(source.repo) === key);
  if (matches.length !== 1) throw new Error(`Expected exactly one registry source: ${repository}`);
  return matches[0];
}

function previewNames(themes) {
  const names = new Set();
  for (const theme of themes) {
    const paths = [
      theme.preview?.card,
      theme.preview?.detail,
      ...(theme.wallpapers || []).flatMap((wallpaper) => [wallpaper.thumbnail, wallpaper.detail]),
    ];
    for (const path of paths) {
      if (!/^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path || "")) {
        throw new Error(`Invalid generated image path for theme: ${theme.id}`);
      }
      names.add(path.split("/").at(-1));
    }
  }
  return names;
}

export function verifyThemeUpdateProjection(baseRegistry, baseCatalog, nextRegistry, nextCatalog, report, expected) {
  if (report?.schemaVersion !== 1
    || report.themeId !== expected.themeId
    || report.updatedCommit?.toLowerCase() !== expected.commit.toLowerCase()
    || report.updatedBy !== expected.updatedBy
    || report.testedOmarchyVersion !== expected.testedOmarchyVersion) {
    throw new Error("Theme update report does not match the authorized request");
  }
  if (!fullCommitPattern.test(report.previousCommit || "") || !fullCommitPattern.test(report.updatedCommit || "")) {
    throw new Error("Theme update report must bind full snapshot commits");
  }
  const baseTheme = themeById(baseCatalog, expected.themeId);
  const nextTheme = themeById(nextCatalog, expected.themeId);
  if (baseTheme.sourceType !== "community"
    || nextTheme.sourceType !== "community"
    || githubRepositoryKey(baseTheme.repo) !== githubRepositoryKey(report.repository)
    || githubRepositoryKey(nextTheme.repo) !== githubRepositoryKey(report.repository)
    || baseTheme.checkedCommit.toLowerCase() !== report.previousCommit.toLowerCase()
    || nextTheme.checkedCommit.toLowerCase() !== report.updatedCommit.toLowerCase()) {
    throw new Error("Theme update catalog projection does not match its report");
  }

  const baseSource = sourceByRepository(baseRegistry, report.repository);
  const nextSource = sourceByRepository(nextRegistry, report.repository);
  if (githubRepositoryKey(nextSource.listingUpdatedRepository) !== githubRepositoryKey(report.repository)
    || nextSource.listingUpdatedCommit?.toLowerCase() !== report.updatedCommit.toLowerCase()
    || nextSource.listingUpdatedBranch !== report.updatedBranch
    || nextSource.listingUpdatedAt !== report.updatedAt
    || nextSource.listingUpdatedBy !== report.updatedBy
    || nextSource.testedOmarchyVersion !== report.testedOmarchyVersion) {
    throw new Error("Theme update registry projection does not match its report");
  }
  const archived = nextSource.listingUpdateHistory?.at(-1);
  if (!archived
    || archived.repository !== baseTheme.repo
    || archived.commit.toLowerCase() !== baseTheme.checkedCommit.toLowerCase()
    || archived.branch !== baseTheme.checkedBranch
    || archived.checkedAt !== baseTheme.checkedAt
    || archived.supersededAt !== report.updatedAt) {
    throw new Error("Theme update did not archive the exact previous catalog snapshot");
  }

  const baseRegistryWithoutSources = { ...baseRegistry, sources: undefined };
  const nextRegistryWithoutSources = { ...nextRegistry, sources: undefined };
  if (!same(baseRegistryWithoutSources, nextRegistryWithoutSources)) {
    throw new Error("Theme update changed registry state outside community sources");
  }
  const baseUnrelatedSources = baseRegistry.sources.filter((source) => source !== baseSource);
  const nextUnrelatedSources = nextRegistry.sources.filter((source) => source !== nextSource);
  if (!same(baseUnrelatedSources, nextUnrelatedSources)) {
    throw new Error("Theme update changed an unrelated registry source");
  }

  const baseUnrelatedThemes = baseCatalog.themes.filter((theme) => theme.id !== expected.themeId);
  const nextUnrelatedThemes = nextCatalog.themes.filter((theme) => theme.id !== expected.themeId);
  if (!same(baseUnrelatedThemes, nextUnrelatedThemes)) {
    throw new Error("Theme update changed an unrelated catalog record");
  }
  if (nextCatalog.schemaVersion !== baseCatalog.schemaVersion
    || nextCatalog.mode !== baseCatalog.mode
    || Date.parse(nextCatalog.generatedAt) <= Date.parse(baseCatalog.generatedAt)) {
    throw new Error("Theme update catalog metadata is invalid");
  }
  const expectedWarnings = nextCatalog.themes
    .filter((theme) => theme.license === "Not declared")
    .map((theme) => `${theme.name}: upstream repository does not declare a license.`);
  if (!same(nextCatalog.warnings, expectedWarnings)) {
    throw new Error("Theme update catalog warnings are not derived from the final theme set");
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
    throw new Error("Theme update image directory does not exactly match the next catalog");
  }
  for (const name of plan.unrelatedPreviewNames) {
    const [before, after] = await Promise.all([
      readFile(resolve(baseDirectory, name)),
      readFile(resolve(nextDirectory, name)),
    ]);
    if (!before.equals(after)) throw new Error(`Theme update changed an unrelated image: ${name}`);
  }
  for (const name of plan.replacedPreviewNames) {
    if (!plan.nextPreviewNames.has(name) && nextFiles.has(name)) {
      throw new Error(`Theme update retained an obsolete target image: ${name}`);
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
  const plan = verifyThemeUpdateProjection(baseRegistry, baseCatalog, nextRegistry, nextCatalog, report, {
    themeId: process.env.MARKETPLACE_UPDATE_THEME_ID || "",
    commit: process.env.MARKETPLACE_UPDATE_COMMIT || "",
    updatedBy: process.env.MARKETPLACE_UPDATE_BY || "",
    testedOmarchyVersion: process.env.MARKETPLACE_UPDATE_OMARCHY_VERSION || "",
  });
  await verifyPreviewProjection(
    plan,
    resolve(values["base-preview-dir"]),
    resolve(values["next-preview-dir"]),
  );
  process.stdout.write(`Verified exact update projection for ${plan.nextTheme.id}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}
