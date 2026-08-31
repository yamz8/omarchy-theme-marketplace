import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { githubRepositoryKey } from "./github-repository.mjs";
import { themeSlugFromRepository } from "./theme-domain.mjs";

const maximumBatchSize = 20;
const maximumThemeIdLength = 128;
const previewPrefix = "assets/img/themes/";

function strictIsoTimestamp(value, field) {
  if (typeof value !== "string") throw new Error(`${field} must be an ISO timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return timestamp;
}

function normalizedPreviewPath(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !value.startsWith(previewPrefix)) {
    throw new Error("Catalog preview paths must stay inside assets/img/themes");
  }
  const filename = value.slice(previewPrefix.length);
  if (!filename || basename(filename) !== filename || filename.includes("..") || !filename.endsWith(".webp")) {
    throw new Error("Catalog preview paths must name one generated WebP file");
  }
  return value;
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseThemeIds(value) {
  if (typeof value !== "string") throw new Error("Theme IDs are required");
  const ids = value.split(/[\s,]+/).filter(Boolean);
  if (!ids.length) throw new Error("Enter at least one theme ID");
  if (ids.length > maximumBatchSize) throw new Error(`Delist at most ${maximumBatchSize} themes at once`);
  if (new Set(ids).size !== ids.length) throw new Error("Theme IDs must not be repeated");
  for (const id of ids) {
    if (id.length > maximumThemeIdLength || !/^[a-z0-9][a-z0-9._-]*$/.test(id) || id.includes("..")) {
      throw new Error(`Invalid theme ID: ${id}`);
    }
  }
  return ids.sort();
}

function activeThemeSources(registry) {
  const byId = new Map();
  const byRepository = new Map();
  const retired = new Set(registry.retiredThemeIds);
  for (const source of registry.sources) {
    const id = themeSlugFromRepository(source.repo);
    const repositoryKey = githubRepositoryKey(source.repo);
    if (byId.has(id) || byRepository.has(repositoryKey) || retired.has(id)) {
      throw new Error(`Registry has an ambiguous active theme source: ${source.repo}`);
    }
    byId.set(id, source);
    byRepository.set(repositoryKey, { id, source });
  }
  return { byId, byRepository };
}

export function planThemeDelisting(registry, catalog, requestedThemeIds, options = {}) {
  if (registry?.schemaVersion !== 1
    || !Array.isArray(registry.sources)
    || !Array.isArray(registry.retiredThemeIds)
    || catalog?.schemaVersion !== 1
    || !Array.isArray(catalog.themes)
    || !Array.isArray(catalog.warnings)) {
    throw new Error("Registry and catalog must use the current theme marketplace schema");
  }
  if (new Set(registry.retiredThemeIds).size !== registry.retiredThemeIds.length) {
    throw new Error("Registry has duplicate retired theme IDs");
  }

  const themeIds = parseThemeIds(requestedThemeIds.join("\n"));
  const requested = new Set(themeIds);
  const retired = new Set(registry.retiredThemeIds);
  for (const id of themeIds) {
    if (retired.has(id)) throw new Error(`Theme is already retired: ${id}`);
  }

  const active = activeThemeSources(registry);
  const selectedSources = new Set();
  for (const id of themeIds) {
    const source = active.byId.get(id);
    if (!source) throw new Error(`Theme is not an active registry listing: ${id}`);
    selectedSources.add(source);
  }

  const catalogById = new Map();
  for (const theme of catalog.themes) {
    if (typeof theme?.id !== "string" || catalogById.has(theme.id)) {
      throw new Error(`Catalog has an ambiguous theme ID: ${theme?.id || "<missing>"}`);
    }
    catalogById.set(theme.id, theme);
    if (theme.sourceType === "community") {
      const activeSource = active.byRepository.get(githubRepositoryKey(theme.repo));
      if (!activeSource || activeSource.id !== theme.id) {
        throw new Error(`Catalog has a stale community theme source: ${theme.repo}`);
      }
    }
  }
  for (const [id, source] of active.byId) {
    const theme = catalogById.get(id);
    if (!theme || theme.sourceType !== "community" || githubRepositoryKey(theme.repo) !== githubRepositoryKey(source.repo)) {
      throw new Error(`Catalog listing does not match the active registry source: ${id}`);
    }
  }

  const removedThemes = themeIds.map((id) => catalogById.get(id));
  const previewPaths = new Set();
  for (const theme of removedThemes) {
    for (const variant of ["card", "detail"]) {
      const previewPath = normalizedPreviewPath(theme.preview?.[variant]);
      if (previewPath) previewPaths.add(previewPath);
    }
  }
  const remainingThemes = catalog.themes.filter((theme) => !requested.has(theme.id));
  for (const theme of remainingThemes) {
    for (const variant of ["card", "detail"]) {
      const previewPath = normalizedPreviewPath(theme.preview?.[variant]);
      if (previewPath && previewPaths.has(previewPath)) {
        throw new Error(`Preview is shared with a retained theme: ${previewPath}`);
      }
    }
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  const previousGeneratedAt = strictIsoTimestamp(catalog.generatedAt, "Catalog generatedAt");
  const nextGeneratedAt = strictIsoTimestamp(generatedAt, "Delisting generatedAt");
  if (nextGeneratedAt <= previousGeneratedAt) {
    throw new Error("Delisting generatedAt must be newer than the catalog");
  }

  const repositories = [...selectedSources].map((source) => source.repo).sort();
  const nextWarnings = remainingThemes
    .filter((theme) => theme.license === "Not declared")
    .map((theme) => `${theme.name}: upstream repository does not declare a license.`);
  const nextRegistry = {
    ...registry,
    retiredThemeIds: [...registry.retiredThemeIds, ...themeIds].sort(),
    sources: registry.sources.filter((source) => !selectedSources.has(source)),
  };
  const nextCatalog = {
    ...catalog,
    generatedAt,
    themes: remainingThemes,
    warnings: nextWarnings,
  };
  const report = {
    schemaVersion: 1,
    requestedBy: options.requestedBy || "",
    generatedAt,
    themeIds,
    repositories,
    removedThemeCount: removedThemes.length,
    removedSourceCount: selectedSources.size,
    removedWarningCount: catalog.warnings.length - nextWarnings.length,
    removedPreviewPaths: [...previewPaths].sort(),
    commitSubject: themeIds.length === 1
      ? `Delist ${themeIds[0]} theme`
      : `Delist ${themeIds.length} marketplace themes`,
  };
  return { nextRegistry, nextCatalog, report };
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

export async function applyThemeDelisting(options) {
  const previewDirectory = resolve(options.previewDirectory);
  const previewRootMetadata = await lstat(previewDirectory);
  if (!previewRootMetadata.isDirectory() || previewRootMetadata.isSymbolicLink()
    || await realpath(previewDirectory) !== previewDirectory) {
    throw new Error("Preview directory must be a real directory without symbolic links");
  }
  const registry = JSON.parse(await readFile(options.registryPath, "utf8"));
  const catalog = JSON.parse(await readFile(options.catalogPath, "utf8"));
  const result = planThemeDelisting(registry, catalog, options.themeIds, {
    generatedAt: options.generatedAt,
    requestedBy: options.requestedBy,
  });

  for (const previewPath of result.report.removedPreviewPaths) {
    const target = resolve(previewDirectory, previewPath.slice(previewPrefix.length));
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Preview is not a regular file: ${previewPath}`);
    }
  }

  await writeAtomic(options.registryPath, serialized(result.nextRegistry));
  await writeAtomic(options.catalogPath, serialized(result.nextCatalog));
  await writeAtomic(options.reportPath, serialized(result.report));
  for (const previewPath of result.report.removedPreviewPaths) {
    await unlink(resolve(previewDirectory, previewPath.slice(previewPrefix.length)));
  }
  return result.report;
}

async function main() {
  const { values } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      catalog: { type: "string", default: "site/catalog.json" },
      "preview-dir": { type: "string", default: "site/assets/img/themes" },
      report: { type: "string" },
    },
    strict: true,
  });
  if (!values.report) throw new Error("--report is required");
  const themeIds = parseThemeIds(process.env.MARKETPLACE_DELIST_THEME_IDS || "");
  const report = await applyThemeDelisting({
    registryPath: resolve(values.registry),
    catalogPath: resolve(values.catalog),
    previewDirectory: resolve(values["preview-dir"]),
    reportPath: resolve(values.report),
    themeIds,
    generatedAt: process.env.MARKETPLACE_DELIST_GENERATED_AT || undefined,
    requestedBy: process.env.MARKETPLACE_DELIST_REQUESTED_BY || "",
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
