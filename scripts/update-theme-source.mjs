import { appendFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { githubRepositoryKey } from "./github-repository.mjs";
import { themeSlugFromRepository } from "./theme-domain.mjs";
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

function validThemeId(value) {
  return typeof value === "string"
    && value.length <= 128
    && /^[a-z0-9][a-z0-9._-]*$/.test(value)
    && !value.includes("..");
}

function validateUpdateHistory(history) {
  if (history === undefined) return [];
  if (!Array.isArray(history)) throw new Error("Theme update history must be an array");
  const commits = new Set();
  for (const entry of history) {
    if (!fullCommitPattern.test(entry?.commit || "")
      || typeof entry?.branch !== "string"
      || !entry.branch
      || typeof entry?.repository !== "string") {
      throw new Error("Theme update history contains invalid snapshot provenance");
    }
    githubRepositoryKey(entry.repository);
    strictIsoTimestamp(entry.checkedAt, "Update history checkedAt");
    strictIsoTimestamp(entry.supersededAt, "Update history supersededAt");
    if (commits.has(entry.commit.toLowerCase())) {
      throw new Error("Theme update history repeats a snapshot commit");
    }
    commits.add(entry.commit.toLowerCase());
  }
  return history;
}

function activeSource(registry, themeId) {
  const matches = registry.sources.filter((source) => themeSlugFromRepository(source.repo) === themeId);
  if (matches.length !== 1) throw new Error(`Theme is not one unambiguous active source: ${themeId}`);
  return matches[0];
}

function activeCatalogTheme(catalog, themeId) {
  const matches = catalog.themes.filter((theme) => theme.id === themeId);
  if (matches.length !== 1 || matches[0].sourceType !== "community") {
    throw new Error(`Theme is not one active community catalog record: ${themeId}`);
  }
  return matches[0];
}

export function planThemeUpdate(registry, catalog, themeId, validation, options = {}) {
  if (registry?.schemaVersion !== 1
    || !Array.isArray(registry.sources)
    || !Array.isArray(registry.retiredThemeIds)
    || catalog?.schemaVersion !== 1
    || !Array.isArray(catalog.themes)) {
    throw new Error("Registry and catalog must use the current theme marketplace schema");
  }
  if (!validThemeId(themeId)) throw new Error(`Invalid theme ID: ${themeId}`);
  if (registry.retiredThemeIds.includes(themeId)) throw new Error(`Theme is retired: ${themeId}`);

  const source = activeSource(registry, themeId);
  const currentTheme = activeCatalogTheme(catalog, themeId);
  if (githubRepositoryKey(source.repo) !== githubRepositoryKey(currentTheme.repo)) {
    throw new Error("The active registry source and catalog repository do not match");
  }
  if (!fullCommitPattern.test(currentTheme.checkedCommit || "")
    || typeof currentTheme.checkedBranch !== "string"
    || !currentTheme.checkedBranch) {
    throw new Error("The current catalog snapshot provenance cannot be archived");
  }
  strictIsoTimestamp(currentTheme.checkedAt, "Current catalog checkedAt");
  const history = validateUpdateHistory(source.listingUpdateHistory);

  if (!fullCommitPattern.test(validation?.commit || "")) {
    throw new Error("Theme update validation must resolve a full commit SHA");
  }
  if (validation.commit.toLowerCase() === currentTheme.checkedCommit.toLowerCase()) {
    throw new Error("Requested theme commit is already the current catalog snapshot");
  }
  if (validation.themeId !== themeId
    || githubRepositoryKey(validation.repository) !== githubRepositoryKey(source.repo)) {
    throw new Error("Theme update validation does not match the active source identity");
  }
  if (typeof validation.branch !== "string" || !validation.branch) {
    throw new Error("Theme update validation is missing its source branch");
  }

  const updatedAt = options.updatedAt || new Date().toISOString();
  const updatedTimestamp = strictIsoTimestamp(updatedAt, "Theme updatedAt");
  if (updatedTimestamp <= strictIsoTimestamp(catalog.generatedAt, "Catalog generatedAt")) {
    throw new Error("Theme updatedAt must be newer than the current catalog");
  }
  if (!/^[A-Za-z0-9-]+$/.test(options.updatedBy || "")) {
    throw new Error("Theme update actor is missing or invalid");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(options.testedOmarchyVersion || "")) {
    throw new Error("Tested Omarchy version is missing or invalid");
  }

  const archivedSnapshot = {
    repository: currentTheme.repo,
    commit: currentTheme.checkedCommit,
    branch: currentTheme.checkedBranch,
    checkedAt: currentTheme.checkedAt,
    supersededAt: updatedAt,
  };
  const nextSource = {
    ...source,
    license: validation.license,
    testedOmarchyVersion: options.testedOmarchyVersion,
    listingUpdatedRepository: source.repo,
    listingUpdatedCommit: validation.commit,
    listingUpdatedBranch: validation.branch,
    listingUpdatedAt: updatedAt,
    listingUpdatedBy: options.updatedBy,
    listingUpdateHistory: [...history, archivedSnapshot],
  };
  const nextRegistry = {
    ...registry,
    sources: registry.sources.map((candidate) => candidate === source ? nextSource : candidate),
  };
  const report = {
    schemaVersion: 1,
    themeId,
    repository: source.repo,
    previousCommit: currentTheme.checkedCommit,
    updatedCommit: validation.commit,
    updatedBranch: validation.branch,
    updatedAt,
    updatedBy: options.updatedBy,
    testedOmarchyVersion: options.testedOmarchyVersion,
    ignoredFiles: [...(validation.ignoredFiles || [])],
    warnings: [...(validation.warnings || [])],
    commitSubject: `Update ${themeId} theme`,
  };
  return { source, currentTheme, nextSource, nextRegistry, report };
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

export async function updateThemeSource(options, dependencies = {}) {
  const [registry, catalog] = await Promise.all([
    readFile(options.registryPath, "utf8").then(JSON.parse),
    readFile(options.catalogPath, "utf8").then(JSON.parse),
  ]);
  const source = activeSource(registry, options.themeId);
  const validation = await (dependencies.validateSource || validateCommunityThemeSource)(source, {
    expectedCommit: options.expectedCommit,
  });
  if (validation.commit.toLowerCase() !== String(options.expectedCommit || "").toLowerCase()) {
    throw new Error("Validated update commit does not match the requested exact snapshot");
  }
  const result = planThemeUpdate(registry, catalog, options.themeId, validation, options);
  await writeAtomic(options.registryPath, `${JSON.stringify(result.nextRegistry, null, 2)}\n`);
  await writeAtomic(options.reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  return { ...result, validation };
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
  const result = await updateThemeSource({
    registryPath: resolve(values.registry),
    catalogPath: resolve(values.catalog),
    reportPath: resolve(values.report),
    themeId: process.env.MARKETPLACE_UPDATE_THEME_ID || "",
    expectedCommit: process.env.MARKETPLACE_UPDATE_COMMIT || "",
    updatedAt: process.env.MARKETPLACE_UPDATE_AT || undefined,
    updatedBy: process.env.MARKETPLACE_UPDATE_BY || "",
    testedOmarchyVersion: process.env.MARKETPLACE_UPDATE_OMARCHY_VERSION || "",
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, [
      `repository=${result.validation.repository}`,
      `commit=${result.validation.commit}`,
      `theme_id=${result.validation.themeId}`,
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
