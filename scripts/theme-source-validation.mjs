import sharp from "sharp";
import { createThemeCatalogRecord, inspectThemeTree } from "./theme-domain.mjs";
import {
  fetchSnapshotBuffer,
  fetchSnapshotText,
  resolveRepositorySnapshot,
  sourceAtCommit,
} from "./theme-github-source.mjs";

export const maxThemePreviewBytes = 50 * 1024 * 1024;
export const maxThemePreviewPixels = 40_000_000;
const maxColorsTomlBytes = 128 * 1024;

function requireSubmissionStructure(tree) {
  if (!tree.backgroundCount) throw new Error("Theme repository must contain at least one supported image directly under backgrounds/.");
  if (!tree.readmePath) throw new Error("Theme repository must contain a root README file.");
  if (!tree.licensePath) throw new Error("Theme repository must contain a root license file.");
}

async function validatePreview(snapshot, path, fetchBuffer) {
  const entry = snapshot.entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Theme preview source is missing from the resolved tree: ${path}`);
  if (entry.size > maxThemePreviewBytes) throw new Error(`Theme preview exceeds 50 MB: ${path}`);
  const buffer = await fetchBuffer(snapshot, path, { maxBytes: maxThemePreviewBytes });
  const metadata = await sharp(buffer, { animated: false, limitInputPixels: maxThemePreviewPixels }).metadata();
  const pixels = Number(metadata.width || 0) * Number(metadata.height || 0);
  if (!pixels || pixels > maxThemePreviewPixels) throw new Error(`Theme preview has unsupported dimensions: ${path}`);
  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error(`Theme preview must be PNG, JPEG, or WebP: ${path}`);
  }
  return Object.freeze({
    path,
    width: Number(metadata.width),
    height: Number(metadata.height),
    format: String(metadata.format || "unknown"),
  });
}

export async function validateCommunityThemeSource(submission, {
  expectedCommit = "",
  resolveSnapshot = resolveRepositorySnapshot,
  fetchText = fetchSnapshotText,
  fetchBuffer = fetchSnapshotBuffer,
} = {}) {
  const snapshot = await resolveSnapshot(submission.repo, "", { expectedCommit });
  const tree = inspectThemeTree(snapshot.entries);
  requireSubmissionStructure(tree);
  const colorsEntry = snapshot.entries.find((entry) => entry.path === "colors.toml" && entry.type === "blob");
  if (!colorsEntry || colorsEntry.size > maxColorsTomlBytes) {
    throw new Error("Root colors.toml is missing or exceeds 128 KB.");
  }
  const colorsToml = await fetchText(snapshot, "colors.toml", { maxBytes: maxColorsTomlBytes });
  const license = snapshot.license || "See repository";
  const theme = createThemeCatalogRecord({
    ...submission,
    entries: snapshot.entries,
    colorsToml,
    sourceType: "community",
    license,
    sourceUrl: sourceAtCommit(snapshot),
    stars: snapshot.stars,
    repositoryUpdatedAt: snapshot.updatedAt,
    checkedCommit: snapshot.commit,
    checkedBranch: snapshot.branch,
    checkedAt: snapshot.checkedAt,
  });
  const preview = await validatePreview(snapshot, tree.previewPath, fetchBuffer);
  const warnings = tree.ignoredFiles.length
    ? [`Omarchy remote installation filters these repository entries: ${tree.ignoredFiles.join(", ")}.`]
    : [];

  return Object.freeze({
    repository: theme.repo,
    themeId: theme.id,
    themeName: theme.name,
    commit: snapshot.commit,
    branch: snapshot.branch,
    checkedAt: snapshot.checkedAt,
    mode: theme.mode,
    license,
    backgroundCount: tree.backgroundCount,
    preview,
    ignoredFiles: tree.ignoredFiles,
    warnings: Object.freeze(warnings),
  });
}
