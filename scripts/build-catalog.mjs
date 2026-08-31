import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { githubRepositoryKey } from "./github-repository.mjs";
import {
  builtInThemeDirectories,
  entriesBelow,
  fetchSnapshotBuffer,
  fetchSnapshotText,
  resolveRepositorySnapshot,
  sourceAtCommit,
} from "./theme-github-source.mjs";
import {
  assertUniqueThemeIds,
  createThemeCatalogRecord,
  inspectThemeTree,
} from "./theme-domain.mjs";
import {
  assertObservedThemeRepositoryIdentity,
  validateThemeRepositoryMigrations,
} from "./theme-repository-identity.mjs";

const root = resolve(import.meta.dirname, "..");
const registryPath = resolve(root, "registry.json");
const catalogPath = resolve(root, "site/catalog.json");
const imageDirectory = resolve(root, "site/assets/img/themes");
const maxPreviewBytes = 50 * 1024 * 1024;
const maxPreviewPixels = 40_000_000;

function stableImagePrefix(theme) {
  const digest = createHash("sha256")
    .update(`${theme.repo}\0${theme.checkedCommit}\0${theme.previewSourcePath}`)
    .digest("hex")
    .slice(0, 10);
  return `${theme.id}-${digest}`;
}

async function normalizePreview(buffer, prefix, outputDirectory) {
  const metadata = await sharp(buffer, { animated: false, limitInputPixels: maxPreviewPixels }).metadata();
  const pixels = Number(metadata.width || 0) * Number(metadata.height || 0);
  if (!pixels || pixels > maxPreviewPixels) throw new Error(`Preview has unsupported dimensions: ${prefix}`);

  const cardName = `${prefix}-card.webp`;
  const detailName = `${prefix}-detail.webp`;
  await Promise.all([
    sharp(buffer, { animated: false, limitInputPixels: maxPreviewPixels })
      .rotate()
      .resize({ width: 720, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(resolve(outputDirectory, cardName)),
    sharp(buffer, { animated: false, limitInputPixels: maxPreviewPixels })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(resolve(outputDirectory, detailName)),
  ]);
  return {
    card: `assets/img/themes/${cardName}`,
    detail: `assets/img/themes/${detailName}`,
  };
}

async function materializeTheme({ theme, snapshot, previewPath, outputDirectory }) {
  if (!previewPath) return { ...theme, preview: null };
  const preview = await fetchSnapshotBuffer(snapshot, previewPath, { maxBytes: maxPreviewBytes });
  return {
    ...theme,
    preview: await normalizePreview(preview, stableImagePrefix(theme), outputDirectory),
  };
}

async function buildBuiltInThemes(source, outputDirectory) {
  const snapshot = await resolveRepositorySnapshot(source.repo, source.branch);
  const themes = [];
  for (const slug of builtInThemeDirectories(snapshot, source.themeRoot)) {
    const directory = `${source.themeRoot}/${slug}`;
    const entries = entriesBelow(snapshot.entries, directory);
    const tree = inspectThemeTree(entries);
    const colorsToml = await fetchSnapshotText(snapshot, `${directory}/colors.toml`);
    const theme = createThemeCatalogRecord({
      repo: source.repo,
      entries,
      colorsToml,
      sourceType: "builtin",
      name: slug,
      description: `A built-in Omarchy ${slug.replaceAll("-", " ")} theme.`,
      author: "Omarchy",
      tags: ["official"],
      license: snapshot.license || "MIT",
      sourceUrl: sourceAtCommit(snapshot, directory),
      stars: snapshot.stars,
      repositoryUpdatedAt: snapshot.updatedAt,
      checkedCommit: snapshot.commit,
      checkedBranch: snapshot.branch,
      checkedAt: snapshot.checkedAt,
    });
    themes.push(await materializeTheme({
      theme,
      snapshot,
      previewPath: tree.previewPath ? `${directory}/${tree.previewPath}` : "",
      outputDirectory,
    }));
  }
  return themes;
}

async function buildCommunityTheme(source, outputDirectory, { expectedCommit = "" } = {}) {
  const snapshot = await resolveRepositorySnapshot(source.repo, source.branch, { expectedCommit });
  assertObservedThemeRepositoryIdentity(source, snapshot.repositoryIdentity);
  const tree = inspectThemeTree(snapshot.entries);
  const colorsToml = await fetchSnapshotText(snapshot, "colors.toml");
  const theme = createThemeCatalogRecord({
    ...source,
    entries: snapshot.entries,
    colorsToml,
    sourceType: "community",
    license: source.license || snapshot.license || "Not declared",
    sourceUrl: sourceAtCommit(snapshot),
    stars: snapshot.stars,
    repositoryUpdatedAt: snapshot.updatedAt,
    checkedCommit: snapshot.commit,
    checkedBranch: snapshot.branch,
    checkedAt: snapshot.checkedAt,
  });
  return materializeTheme({
    theme,
    snapshot,
    previewPath: tree.previewPath,
    outputDirectory,
  });
}

function validateRegistry(registry) {
  if (registry?.schemaVersion !== 1) throw new Error("registry.json must use schemaVersion 1");
  if (!Array.isArray(registry.builtInSources) || registry.builtInSources.length === 0) {
    throw new Error("registry.json must declare at least one built-in Omarchy theme source");
  }
  if (!Array.isArray(registry.sources)) throw new Error("registry.json sources must be an array");
  validateThemeRepositoryMigrations(registry);
  const expectedRepository = process.env.EXPECTED_THEME_REPOSITORY || "";
  const expectedCommit = process.env.EXPECTED_THEME_COMMIT || "";
  const previousRepository = process.env.PREVIOUS_THEME_REPOSITORY || "";
  const pinCommunitySnapshots = process.env.PIN_COMMUNITY_CATALOG_SNAPSHOTS || "";
  if (pinCommunitySnapshots && pinCommunitySnapshots !== "1") {
    throw new Error("PIN_COMMUNITY_CATALOG_SNAPSHOTS must be exactly 1 when set");
  }
  if (pinCommunitySnapshots && expectedRepository) {
    throw new Error("Pinned community refresh and selective theme builds are mutually exclusive");
  }
  if (expectedRepository && !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error("EXPECTED_THEME_COMMIT must be a full commit SHA when EXPECTED_THEME_REPOSITORY is set");
  }
  if (expectedRepository && !registry.sources.some((source) => githubRepositoryKey(source.repo) === githubRepositoryKey(expectedRepository))) {
    throw new Error(`Expected theme repository is not present in registry.json: ${expectedRepository}`);
  }
  if (previousRepository && !expectedRepository) {
    throw new Error("PREVIOUS_THEME_REPOSITORY requires EXPECTED_THEME_REPOSITORY");
  }
  if (previousRepository && githubRepositoryKey(previousRepository) === githubRepositoryKey(expectedRepository)) {
    throw new Error("PREVIOUS_THEME_REPOSITORY must identify a different historical path");
  }
  if (previousRepository && registry.sources.some((source) => (
    githubRepositoryKey(source.repo) === githubRepositoryKey(previousRepository)
  ))) {
    throw new Error("PREVIOUS_THEME_REPOSITORY must no longer be an active registry source");
  }
}

function sourceKeys(sources, label) {
  const keys = sources.map((source) => githubRepositoryKey(source.repo));
  if (new Set(keys).size !== keys.length) {
    throw new Error(`registry.json contains duplicate ${label} repositories`);
  }
  return new Set(keys);
}

export function communitySnapshotPins(registry, previousCatalog) {
  if (previousCatalog?.schemaVersion !== 1 || !Array.isArray(previousCatalog.themes)) {
    throw new Error("Pinned community refresh requires an existing schemaVersion 1 catalog");
  }
  assertUniqueThemeIds(previousCatalog.themes);
  const sourceByRepository = new Map(registry.sources.map((source) => [githubRepositoryKey(source.repo), source]));
  if (sourceByRepository.size !== registry.sources.length) {
    throw new Error("registry.json contains duplicate community theme repositories");
  }
  const pins = new Map();
  for (const theme of previousCatalog.themes.filter((entry) => entry.sourceType === "community")) {
    const repositoryKey = githubRepositoryKey(theme.repo);
    if (!sourceByRepository.has(repositoryKey) || pins.has(repositoryKey)) {
      throw new Error(`Pinned community catalog contains a stale or ambiguous source: ${theme.repo}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(theme.checkedCommit || "")) {
      throw new Error(`Pinned community catalog commit is invalid: ${theme.repo}`);
    }
    pins.set(repositoryKey, theme.checkedCommit.toLowerCase());
  }
  for (const repositoryKey of sourceByRepository.keys()) {
    if (!pins.has(repositoryKey)) {
      throw new Error(`Pinned community catalog is missing an active source: ${repositoryKey}`);
    }
  }
  return pins;
}

export function selectiveThemeBuildPlan(registry, previousCatalog, expectedRepository, { previousRepository = "" } = {}) {
  if (previousCatalog?.schemaVersion !== 1 || !Array.isArray(previousCatalog.themes)) {
    throw new Error("Selective theme builds require an existing schemaVersion 1 catalog");
  }

  const targetKey = githubRepositoryKey(expectedRepository);
  const previousKey = previousRepository ? githubRepositoryKey(previousRepository) : "";
  const builtInKeys = sourceKeys(registry.builtInSources, "built-in theme");
  const communityKeys = sourceKeys(registry.sources, "community theme");
  if (builtInKeys.has(targetKey)) {
    throw new Error("Selective theme builds can only target a community theme repository");
  }
  const targetSources = registry.sources.filter((source) => githubRepositoryKey(source.repo) === targetKey);
  if (targetSources.length !== 1) {
    throw new Error(`Selective theme repository must appear exactly once in registry.json: ${expectedRepository}`);
  }

  assertUniqueThemeIds(previousCatalog.themes);
  const previousByRepository = new Map();
  for (const theme of previousCatalog.themes) {
    const repositoryKey = githubRepositoryKey(theme.repo);
    if (previousKey && repositoryKey === previousKey) {
      if (theme.sourceType !== "community") {
        throw new Error(`Historical migration source is not a community theme: ${theme.repo}`);
      }
      const repositoryThemes = previousByRepository.get(repositoryKey) || [];
      repositoryThemes.push(theme);
      previousByRepository.set(repositoryKey, repositoryThemes);
      continue;
    }
    const expectedKeys = theme.sourceType === "builtin"
      ? builtInKeys
      : theme.sourceType === "community"
        ? communityKeys
        : null;
    if (!expectedKeys?.has(repositoryKey)) {
      throw new Error(`Existing catalog contains a stale or mismatched theme source: ${theme.repo}`);
    }
    const repositoryThemes = previousByRepository.get(repositoryKey) || [];
    repositoryThemes.push(theme);
    previousByRepository.set(repositoryKey, repositoryThemes);
  }

  for (const repositoryKey of builtInKeys) {
    const themes = previousByRepository.get(repositoryKey) || [];
    if (!themes.length || themes.some((theme) => theme.sourceType !== "builtin")) {
      throw new Error(`Existing catalog is missing its built-in theme snapshot: ${repositoryKey}`);
    }
  }
  for (const repositoryKey of communityKeys) {
    const themes = previousByRepository.get(repositoryKey) || [];
    const expectedCount = repositoryKey === targetKey
      ? previousKey ? [0] : [0, 1]
      : [1];
    if (!expectedCount.includes(themes.length) || themes.some((theme) => theme.sourceType !== "community")) {
      throw new Error(`Existing catalog does not exactly cover community theme source: ${repositoryKey}`);
    }
  }

  const previousTargetThemes = [
    ...(previousByRepository.get(targetKey) || []),
    ...(previousKey ? previousByRepository.get(previousKey) || [] : []),
  ];
  if (previousKey && previousTargetThemes.length !== 1) {
    throw new Error(`Existing catalog does not exactly cover historical migration source: ${previousRepository}`);
  }
  return Object.freeze({
    targetKey,
    previousKey,
    targetSource: targetSources[0],
    previousTargetTheme: previousTargetThemes[0] || null,
    preservedThemes: Object.freeze(previousCatalog.themes.filter(
      (theme) => ![targetKey, previousKey].includes(githubRepositoryKey(theme.repo)),
    )),
  });
}

export function mergeSelectiveThemeCatalog(
  registry,
  previousCatalog,
  expectedRepository,
  refreshedTheme,
  generatedAt = new Date().toISOString(),
  options = {},
) {
  const plan = selectiveThemeBuildPlan(registry, previousCatalog, expectedRepository, options);
  if (refreshedTheme.sourceType !== "community" || githubRepositoryKey(refreshedTheme.repo) !== plan.targetKey) {
    throw new Error("Refreshed theme does not match the selective build target");
  }
  if (plan.previousTargetTheme && plan.previousTargetTheme.id !== refreshedTheme.id) {
    throw new Error(`Theme repository changed its installed slug from ${plan.previousTargetTheme.id} to ${refreshedTheme.id}`);
  }
  if ((registry.retiredThemeIds || []).includes(refreshedTheme.id)) {
    throw new Error(`Theme ID is retired and cannot be republished: ${refreshedTheme.id}`);
  }

  const themes = assertUniqueThemeIds([...plan.preservedThemes, refreshedTheme])
    .sort((first, second) => first.name.localeCompare(second.name));
  const warnings = themes
    .filter((theme) => theme.license === "Not declared")
    .map((theme) => `${theme.name}: upstream repository does not declare a license.`);
  return {
    generatedAt,
    schemaVersion: 1,
    mode: "live",
    themes,
    warnings,
  };
}

async function seedPreviewDirectory(outputDirectory) {
  for (const entry of await readdir(imageDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Unexpected generated preview entry: ${entry.name}`);
    await copyFile(resolve(imageDirectory, entry.name), resolve(outputDirectory, entry.name));
  }
}

async function retainReferencedPreviews(themes, outputDirectory) {
  const referenced = new Set();
  for (const theme of themes) {
    for (const variant of ["card", "detail"]) {
      const path = theme.preview?.[variant];
      if (!/^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path || "")) {
        throw new Error(`Theme has an invalid generated preview path: ${theme.id}`);
      }
      referenced.add(path.split("/").at(-1));
    }
  }

  const entries = await readdir(outputDirectory, { withFileTypes: true });
  const available = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const missing = [...referenced].filter((name) => !available.has(name));
  if (missing.length) throw new Error(`Generated theme previews are missing: ${missing.join(", ")}`);
  await Promise.all(entries
    .filter((entry) => !entry.isFile() || !referenced.has(entry.name))
    .map((entry) => rm(resolve(outputDirectory, entry.name), { recursive: true, force: true })));
}

export async function buildCatalog() {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  validateRegistry(registry);
  const temporaryImageDirectory = await mkdtemp(resolve(dirname(imageDirectory), ".themes-"));
  const expectedRepository = process.env.EXPECTED_THEME_REPOSITORY || "";
  const previousRepository = process.env.PREVIOUS_THEME_REPOSITORY || "";
  const pinCommunitySnapshots = process.env.PIN_COMMUNITY_CATALOG_SNAPSHOTS === "1";

  try {
    if (expectedRepository) {
      const previousCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
      const plan = selectiveThemeBuildPlan(registry, previousCatalog, expectedRepository, { previousRepository });
      await seedPreviewDirectory(temporaryImageDirectory);
      const refreshedTheme = await buildCommunityTheme(plan.targetSource, temporaryImageDirectory, {
        expectedCommit: process.env.EXPECTED_THEME_COMMIT,
      });
      const catalog = mergeSelectiveThemeCatalog(
        registry,
        previousCatalog,
        expectedRepository,
        refreshedTheme,
        new Date().toISOString(),
        { previousRepository },
      );
      await retainReferencedPreviews(catalog.themes, temporaryImageDirectory);
      await rm(imageDirectory, { recursive: true, force: true });
      await rename(temporaryImageDirectory, imageDirectory);
      await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
      return catalog;
    }

    const communityPins = pinCommunitySnapshots
      ? communitySnapshotPins(registry, JSON.parse(await readFile(catalogPath, "utf8")))
      : new Map();
    const builtInGroups = await Promise.all(
      registry.builtInSources.map((source) => buildBuiltInThemes(source, temporaryImageDirectory)),
    );
    const communityThemes = await Promise.all(
      registry.sources.map((source) => buildCommunityTheme(source, temporaryImageDirectory, {
        expectedCommit: communityPins.get(githubRepositoryKey(source.repo)) || "",
      })),
    );
    const themes = assertUniqueThemeIds([...builtInGroups.flat(), ...communityThemes])
      .sort((first, second) => first.name.localeCompare(second.name));
    const warnings = themes
      .filter((theme) => theme.license === "Not declared")
      .map((theme) => `${theme.name}: upstream repository does not declare a license.`);
    const catalog = {
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      mode: "live",
      themes,
      warnings,
    };

    await rm(imageDirectory, { recursive: true, force: true });
    await rename(temporaryImageDirectory, imageDirectory);
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    return catalog;
  } catch (error) {
    await rm(temporaryImageDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const catalog = await buildCatalog();
  console.log(`Built ${catalog.themes.length} Omarchy themes (${catalog.warnings.length} warnings).`);
}
