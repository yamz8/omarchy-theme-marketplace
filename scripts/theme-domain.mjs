import { parseGitHubRepository } from "./github-repository.mjs";

export const themePreviewNames = Object.freeze([
  "preview.png",
  "preview.jpg",
  "preview.jpeg",
  "preview.webp",
  "preview.gif",
  "preview.bmp",
]);

export const installedThemeDeniedNames = Object.freeze([
  "alacritty.toml",
  "foot.ini",
  "ghostty.conf",
  "kitty.conf",
  "vscode.json",
]);

const paletteKeys = Object.freeze([
  "accent",
  "selection",
  "selection_foreground",
  "muted",
  "background",
  "dark_background",
  "darker_background",
  "lighter_background",
  "foreground",
  "dark_foreground",
  "light_foreground",
  "bright_foreground",
  "red",
  "yellow",
  "orange",
  "green",
  "cyan",
  "blue",
  "magenta",
  "brown",
  "bright_red",
  "bright_yellow",
  "bright_green",
  "bright_cyan",
  "bright_blue",
  "bright_magenta",
]);

const requiredPaletteKeys = Object.freeze([
  "accent",
  "background",
  "foreground",
  "red",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
]);

const hexColorPattern = /^#[0-9a-f]{6}$/i;
const supportedImagePattern = /\.(?:png|jpe?g|webp|gif|bmp)$/i;
const rootReadmePattern = /^readme(?:\.[a-z0-9_-]+)?$/i;
const rootLicensePattern = /^(?:licen[cs]e|copying|notice)(?:\.[a-z0-9_-]+)?$/i;

export class ThemeCatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ThemeCatalogError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details) {
  throw new ThemeCatalogError(code, message, details);
}

function canonicalRepositoryUrl(repoUrl) {
  const repository = parseGitHubRepository(repoUrl);
  return `https://github.com/${repository.owner}/${repository.repository}`;
}

export function themeSlugFromRepository(repoUrl) {
  const { repository } = parseGitHubRepository(repoUrl);
  const slug = repository
    .replace(/^omarchy-/, "")
    .replace(/-theme$/, "")
    .toLowerCase();

  if (!slug || slug.startsWith(".") || slug.includes("/")) {
    fail(
      "theme-slug-invalid",
      `Repository name does not produce a usable Omarchy theme slug: ${repository}`,
      { repository },
    );
  }
  return slug;
}

export function themeDisplayName(slug) {
  return String(slug || "")
    .replace(/(^|-)([a-z])/g, (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`)
    .replaceAll("-", " ");
}

export function communityThemeInstallCommand(repoUrl) {
  return `omarchy theme install ${canonicalRepositoryUrl(repoUrl)}`;
}

export function builtInThemeSetCommand(slug) {
  const value = String(slug || "");
  if (!value || value.startsWith(".") || value.includes("/") || !/^[a-z0-9._-]+$/.test(value)) {
    fail("theme-slug-invalid", `Invalid built-in Omarchy theme slug: ${value}`);
  }
  return `omarchy theme set ${value}`;
}

export function parseThemeColorsToml(input) {
  const colors = {};
  const text = String(input || "");

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*?))\s*(?:#.*)?$/);
    if (!match) {
      fail("colors-toml-invalid", `Unsupported colors.toml syntax on line ${index + 1}`, {
        line: index + 1,
      });
    }

    const key = match[1];
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!value) {
      fail("colors-toml-invalid", `Empty colors.toml value for ${key}`, {
        key,
        line: index + 1,
      });
    }
    if (!/^[A-Za-z0-9#(),._+/% -]*$/.test(value)) {
      fail("colors-toml-invalid", `Unsupported characters in colors.toml value for ${key}`, {
        key,
        line: index + 1,
      });
    }
    colors[key] = value;
  }

  return colors;
}

function mixHex(start, end, amount) {
  if (!hexColorPattern.test(start || "") || !hexColorPattern.test(end || "")) return "";
  const ratio = Math.min(1, Math.max(0, Number(amount)));
  const channel = (value, offset) => Number.parseInt(value.slice(offset, offset + 2), 16);
  const mixed = [1, 3, 5].map((offset) => Math.round(
    channel(start, offset) * (1 - ratio) + channel(end, offset) * ratio,
  ));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function setFromFallback(colors, key, fallback) {
  if (!colors[key] && colors[fallback]) colors[key] = colors[fallback];
}

export function resolveThemePalette(rawColors, { legacyLightMode = false } = {}) {
  const colors = { ...rawColors };
  const legacyPalette = {
    background: "bg",
    dark_background: "dark_bg",
    darker_background: "darker_bg",
    lighter_background: "lighter_bg",
    foreground: "fg",
    dark_foreground: "dark_fg",
    light_foreground: "light_fg",
    bright_foreground: "bright_fg",
  };

  for (const [canonical, legacy] of Object.entries(legacyPalette)) {
    setFromFallback(colors, canonical, legacy);
  }

  if (!colors.background) colors.background = colors.color0;
  if (!colors.foreground) colors.foreground = colors.color7;
  if (colors.background) colors.color0 = colors.background;
  if (colors.foreground) colors.color7 = colors.foreground;

  const ansiAliases = {
    red: "color1",
    green: "color2",
    yellow: "color3",
    blue: "color4",
    magenta: "color5",
    cyan: "color6",
    bright_red: "color9",
    bright_green: "color10",
    bright_yellow: "color11",
    bright_blue: "color12",
    bright_magenta: "color13",
    bright_cyan: "color14",
  };
  for (const [semantic, ansi] of Object.entries(ansiAliases)) {
    setFromFallback(colors, semantic, ansi);
  }
  setFromFallback(colors, "magenta", "purple");
  setFromFallback(colors, "bright_magenta", "bright_purple");

  colors.light_foreground ||= colors.color7 || colors.foreground;
  colors.bright_foreground ||= colors.color15 || colors.foreground;
  colors.cursor = colors.bright_foreground;
  colors.lighter_background ||= colors.color0 || colors.background;
  colors.dark_foreground ||= colors.color8 || colors.foreground;
  colors.muted ||= colors.color8 || colors.dark_foreground;
  colors.selection ||= colors.selection_background || colors.color8 || colors.color0 || colors.background;
  colors.selection_background ||= colors.selection;
  colors.selection_foreground ||= colors.bright_foreground;
  colors.orange ||= colors.yellow;
  colors.brown ||= mixHex(colors.orange, "#000000", 0.5);
  colors.dark_background ||= mixHex(colors.background, "#000000", 0.25);
  colors.darker_background ||= mixHex(colors.background, "#000000", 0.5);
  colors.bright_red ||= mixHex(colors.red, "#ffffff", 0.2);
  colors.bright_yellow ||= mixHex(colors.yellow, "#ffffff", 0.2);
  colors.bright_green ||= mixHex(colors.green, "#ffffff", 0.2);
  colors.bright_cyan ||= mixHex(colors.cyan, "#ffffff", 0.2);
  colors.bright_blue ||= mixHex(colors.blue, "#ffffff", 0.2);
  colors.bright_magenta ||= mixHex(colors.magenta, "#ffffff", 0.2);
  colors.purple ||= colors.magenta;
  colors.bright_purple ||= colors.bright_magenta;

  colors.mode ||= colors.theme_type;
  if (!colors.mode && legacyLightMode) colors.mode = "light";
  if (!colors.mode && hexColorPattern.test(colors.background || "")) {
    const background = colors.background.slice(1);
    const luminance = [0, 2, 4]
      .map((offset) => Number.parseInt(background.slice(offset, offset + 2), 16))
      .reduce((total, value) => total + value, 0);
    colors.mode = luminance > 382 ? "light" : "dark";
  }
  colors.mode ||= "dark";

  if (!["dark", "light"].includes(colors.mode)) {
    fail("theme-mode-invalid", `Theme mode must be dark or light, received: ${colors.mode}`);
  }

  const missing = requiredPaletteKeys.filter((key) => !hexColorPattern.test(colors[key] || ""));
  if (missing.length) {
    fail("theme-palette-incomplete", `Theme palette is missing valid colors: ${missing.join(", ")}`, {
      missing,
    });
  }

  const invalid = paletteKeys.filter((key) => colors[key] && !hexColorPattern.test(colors[key]));
  if (invalid.length) {
    fail("theme-palette-invalid", `Theme palette contains invalid colors: ${invalid.join(", ")}`, {
      invalid,
    });
  }

  return Object.freeze({
    mode: colors.mode,
    colors: Object.freeze(Object.fromEntries(
      paletteKeys.filter((key) => colors[key]).map((key) => [key, colors[key]]),
    )),
  });
}

function normalizedEntry(entry) {
  if (typeof entry === "string") return { path: entry, type: "blob", size: 0 };
  return {
    path: String(entry?.path || ""),
    type: String(entry?.type || "blob"),
    mode: String(entry?.mode || ""),
    size: Number(entry?.size || 0),
  };
}

function isRegularFile(entry) {
  return entry.type === "blob" && entry.mode !== "120000";
}

function isSymlink(entry) {
  return entry.type === "symlink" || entry.mode === "120000";
}

export function inspectThemeTree(entries) {
  const files = entries.map(normalizedEntry).filter((entry) => entry.path);
  const regularFiles = files.filter(isRegularFile);
  const rootFiles = regularFiles.filter((entry) => !entry.path.includes("/"));
  const byLowerPath = new Map(regularFiles.map((entry) => [entry.path.toLowerCase(), entry]));

  if (!regularFiles.some((entry) => entry.path === "colors.toml")) {
    fail("colors-toml-missing", "Theme repository must contain colors.toml at its root");
  }

  const preview = themePreviewNames
    .map((name) => byLowerPath.get(name))
    .find(Boolean);
  const backgrounds = regularFiles
    .filter((entry) => /^backgrounds\/[^/]+$/i.test(entry.path) && supportedImagePattern.test(entry.path))
    .sort((first, second) => first.path.localeCompare(second.path));
  const readme = rootFiles.find((entry) => rootReadmePattern.test(entry.path));
  const license = rootFiles.find((entry) => rootLicensePattern.test(entry.path));
  const ignoredFiles = files
    .filter((entry) => {
      if (isSymlink(entry)) return true;
      if (entry.path.includes("/")) return false;
      const name = entry.path.toLowerCase();
      return name.endsWith(".lua") || installedThemeDeniedNames.includes(name);
    })
    .map((entry) => entry.path)
    .sort();

  return Object.freeze({
    previewPath: preview?.path || backgrounds[0]?.path || "",
    backgroundPaths: Object.freeze(backgrounds.map((entry) => entry.path)),
    backgroundCount: backgrounds.length,
    readmePath: readme?.path || "",
    licensePath: license?.path || "",
    ignoredFiles: Object.freeze(ignoredFiles),
    hasLegacyLightMode: regularFiles.some((entry) => entry.path === "light.mode"),
  });
}

export function createThemeCatalogRecord({
  repo,
  entries,
  colorsToml,
  sourceType,
  name,
  description,
  author,
  tags = [],
  license = "Not declared",
  sourceUrl = "",
  stars = 0,
  repositoryUpdatedAt = "",
  addedAt = "",
  checkedCommit = "",
  checkedBranch = "",
  checkedAt = "",
}) {
  const builtIn = sourceType === "builtin";
  if (!builtIn && sourceType !== "community") {
    fail("theme-source-invalid", `Unsupported theme source type: ${sourceType}`);
  }

  const slug = builtIn ? String(name || "") : themeSlugFromRepository(repo);
  if (builtIn && (!slug || slug.startsWith(".") || slug.includes("/"))) {
    fail("theme-slug-invalid", `Invalid built-in theme slug: ${slug}`);
  }
  const tree = inspectThemeTree(entries);
  const palette = resolveThemePalette(parseThemeColorsToml(colorsToml), {
    legacyLightMode: tree.hasLegacyLightMode,
  });
  const displayName = builtIn ? themeDisplayName(slug) : String(name || themeDisplayName(slug));
  const canonicalRepo = canonicalRepositoryUrl(repo);
  const command = builtIn
    ? builtInThemeSetCommand(slug)
    : communityThemeInstallCommand(canonicalRepo);

  return Object.freeze({
    id: slug,
    slug,
    name: displayName,
    description: String(description || `${displayName} theme for Omarchy.`),
    author: String(author || (builtIn ? "Omarchy" : parseGitHubRepository(repo).owner)),
    repo: canonicalRepo,
    sourceUrl: sourceUrl || canonicalRepo,
    sourceType,
    builtIn,
    mode: palette.mode,
    palette: palette.colors,
    accent: palette.colors.accent,
    tags: Object.freeze([...new Set([palette.mode, ...tags.map(String)])]),
    kind: `${palette.mode === "light" ? "Light" : "Dark"} theme`,
    status: builtIn ? "Built in" : "Available",
    installAvailable: true,
    installCommand: builtIn ? "" : command,
    officialCommand: builtIn ? command : "",
    officialCommandLabel: builtIn ? "Set theme" : "",
    previewSourcePath: tree.previewPath,
    backgroundCount: tree.backgroundCount,
    ignoredFiles: tree.ignoredFiles,
    license: String(license || "Not declared"),
    stars: Number.isFinite(Number(stars)) ? Number(stars) : 0,
    repositoryUpdatedAt,
    addedAt,
    checkedCommit,
    checkedBranch,
    checkedAt,
    compatibilityStatus: "passed",
  });
}

export function assertUniqueThemeIds(themes) {
  const seen = new Set();
  for (const theme of themes) {
    if (seen.has(theme.id)) {
      fail("theme-id-duplicate", `Duplicate Omarchy theme ID: ${theme.id}`, { id: theme.id });
    }
    seen.add(theme.id);
  }
  return themes;
}
