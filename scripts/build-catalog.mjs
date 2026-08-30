import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { parseGitHubRepository } from "./github-repository.mjs";
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
const requestTimeoutMs = 30_000;

function requestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "omarchy-theme-marketplace-build",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchRequired(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response;
}

async function fetchGitHubJson(path) {
  const response = await fetchRequired(`https://api.github.com${path}`, {
    headers: requestHeaders(),
  });
  return response.json();
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function repositorySnapshot(repoUrl, requestedBranch = "") {
  const repository = parseGitHubRepository(repoUrl);
  const repositoryPath = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;
  const metadata = await fetchGitHubJson(`/repos${repositoryPath}`);
  const branch = requestedBranch || metadata.default_branch;
  if (!branch) throw new Error(`Repository has no default branch: ${repository.slug}`);

  const commit = await fetchGitHubJson(`/repos${repositoryPath}/commits/${encodeURIComponent(branch)}`);
  const treeSha = commit?.commit?.tree?.sha;
  if (!commit?.sha || !treeSha) throw new Error(`Unable to resolve ${repository.slug}@${branch}`);

  const tree = await fetchGitHubJson(`/repos${repositoryPath}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
  if (tree.truncated) throw new Error(`Repository tree is too large to inspect completely: ${repository.slug}`);

  return Object.freeze({
    repository,
    branch,
    commit: commit.sha,
    checkedAt: new Date().toISOString(),
    stars: Number(metadata.stargazers_count || 0),
    updatedAt: String(metadata.pushed_at || metadata.updated_at || ""),
    license: metadata.license?.spdx_id && metadata.license.spdx_id !== "NOASSERTION"
      ? metadata.license.spdx_id
      : "",
    entries: Object.freeze((tree.tree || []).map((entry) => ({
      path: String(entry.path || ""),
      type: String(entry.type || ""),
      mode: String(entry.mode || ""),
      size: Number(entry.size || 0),
    }))),
  });
}

function rawUrl(snapshot, path) {
  const { owner, repository } = snapshot.repository;
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(snapshot.commit)}/${encodePath(path)}`;
}

async function fetchRawText(snapshot, path) {
  const response = await fetchRequired(rawUrl(snapshot, path));
  return response.text();
}

async function fetchRawBuffer(snapshot, path) {
  const response = await fetchRequired(rawUrl(snapshot, path));
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxPreviewBytes) throw new Error(`Preview exceeds 50 MB: ${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxPreviewBytes) throw new Error(`Preview exceeds 50 MB: ${path}`);
  return buffer;
}

function entriesBelow(entries, directory) {
  const prefix = directory ? `${directory.replace(/\/$/, "")}/` : "";
  return entries
    .filter((entry) => entry.path.startsWith(prefix) && entry.path !== directory)
    .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
}

function builtInThemeDirectories(snapshot, themeRoot) {
  const prefix = `${themeRoot.replace(/\/$/, "")}/`;
  return [...new Set(snapshot.entries
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix) && entry.path.endsWith("/colors.toml"))
    .map((entry) => entry.path.slice(prefix.length).split("/")[0]))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));
}

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

function sourceAtCommit(snapshot, path = "") {
  const suffix = path ? `/${encodePath(path)}` : "";
  return `https://github.com/${snapshot.repository.owner}/${snapshot.repository.repository}/tree/${snapshot.commit}${suffix}`;
}

async function materializeTheme({ theme, snapshot, previewPath, outputDirectory }) {
  if (!previewPath) return { ...theme, preview: null };
  const preview = await fetchRawBuffer(snapshot, previewPath);
  return {
    ...theme,
    preview: await normalizePreview(preview, stableImagePrefix(theme), outputDirectory),
  };
}

async function buildBuiltInThemes(source, outputDirectory) {
  const snapshot = await repositorySnapshot(source.repo, source.branch);
  const themes = [];
  for (const slug of builtInThemeDirectories(snapshot, source.themeRoot)) {
    const directory = `${source.themeRoot}/${slug}`;
    const entries = entriesBelow(snapshot.entries, directory);
    const tree = inspectThemeTree(entries);
    const colorsToml = await fetchRawText(snapshot, `${directory}/colors.toml`);
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
  const snapshot = await repositorySnapshot(source.repo, source.branch);
  const tree = inspectThemeTree(snapshot.entries);
  const colorsToml = await fetchRawText(snapshot, "colors.toml");
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
