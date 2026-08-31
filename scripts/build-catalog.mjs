import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
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

async function buildCommunityTheme(source, outputDirectory) {
  const expectedRepository = process.env.EXPECTED_THEME_REPOSITORY || "";
  const expectedCommit = expectedRepository && githubRepositoryKey(source.repo) === githubRepositoryKey(expectedRepository)
    ? process.env.EXPECTED_THEME_COMMIT || ""
    : "";
  const snapshot = await resolveRepositorySnapshot(source.repo, source.branch, { expectedCommit });
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
  const expectedRepository = process.env.EXPECTED_THEME_REPOSITORY || "";
  const expectedCommit = process.env.EXPECTED_THEME_COMMIT || "";
  if (expectedRepository && !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error("EXPECTED_THEME_COMMIT must be a full commit SHA when EXPECTED_THEME_REPOSITORY is set");
  }
  if (expectedRepository && !registry.sources.some((source) => githubRepositoryKey(source.repo) === githubRepositoryKey(expectedRepository))) {
    throw new Error(`Expected theme repository is not present in registry.json: ${expectedRepository}`);
  }
}

export async function buildCatalog() {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  validateRegistry(registry);
  const temporaryImageDirectory = await mkdtemp(resolve(dirname(imageDirectory), ".themes-"));

  try {
    const builtInGroups = await Promise.all(
      registry.builtInSources.map((source) => buildBuiltInThemes(source, temporaryImageDirectory)),
    );
    const communityThemes = await Promise.all(
      registry.sources.map((source) => buildCommunityTheme(source, temporaryImageDirectory)),
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
