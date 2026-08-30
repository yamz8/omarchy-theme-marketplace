import assert from "node:assert/strict";
import test from "node:test";
import {
  ThemeCatalogError,
  assertUniqueThemeIds,
  builtInThemeSetCommand,
  communityThemeInstallCommand,
  createThemeCatalogRecord,
  inspectThemeTree,
  parseThemeColorsToml,
  resolveThemePalette,
  themeSlugFromRepository,
} from "../scripts/theme-domain.mjs";

const colorsToml = `
mode = "dark"
accent = "#ff5a36"
background = "#000000"
foreground = "#d7d7d9"
red = "#f18c75"
yellow = "#f4bd62"
green = "#69d4a7"
cyan = "#68d6e8"
blue = "#74a7f7"
magenta = "#a78bfa"
`;

const entries = [
  { path: "colors.toml", type: "blob", mode: "100644" },
  { path: "preview.png", type: "blob", mode: "100644" },
  { path: "backgrounds/desktop.png", type: "blob", mode: "100644" },
  { path: "README.md", type: "blob", mode: "100644" },
  { path: "kitty.conf", type: "blob", mode: "100644" },
  { path: "linked.png", type: "blob", mode: "120000" },
];

test("community repository names follow Omarchy's installed slug convention", () => {
  assert.equal(themeSlugFromRepository("https://github.com/dhh/omarchy-giants-theme"), "giants");
  assert.equal(themeSlugFromRepository("https://github.com/example/Quiet-Garden-theme"), "quiet-garden");
  assert.equal(communityThemeInstallCommand("https://github.com/dhh/omarchy-giants-theme.git"), "omarchy theme install https://github.com/dhh/omarchy-giants-theme");
  assert.equal(builtInThemeSetCommand("tokyo-night"), "omarchy theme set tokyo-night");
});

test("colors.toml is parsed and resolved into an Omarchy palette", () => {
  const palette = resolveThemePalette(parseThemeColorsToml(colorsToml));
  assert.equal(palette.mode, "dark");
  assert.equal(palette.colors.accent, "#ff5a36");
  assert.equal(palette.colors.selection, "#000000");
  assert.equal(palette.colors.orange, "#f4bd62");
  assert.match(palette.colors.dark_background, /^#[0-9a-f]{6}$/);
});

test("theme trees expose supported assets and Omarchy-ignored root files", () => {
  const tree = inspectThemeTree(entries);
  assert.equal(tree.previewPath, "preview.png");
  assert.deepEqual(tree.backgroundPaths, ["backgrounds/desktop.png"]);
  assert.deepEqual(tree.ignoredFiles, ["kitty.conf", "linked.png"]);
});

test("community catalog records contain the official install command", () => {
  const theme = createThemeCatalogRecord({
    repo: "https://github.com/dhh/omarchy-giants-theme",
    entries,
    colorsToml,
    sourceType: "community",
    name: "Giants",
    author: "David Heinemeier Hansson",
  });
  assert.equal(theme.id, "giants");
  assert.equal(theme.sourceType, "community");
  assert.equal(theme.installCommand, "omarchy theme install https://github.com/dhh/omarchy-giants-theme");
  assert.equal(theme.officialCommand, "");
});

test("missing palette fields and duplicate installed IDs fail closed", () => {
  assert.throws(
    () => resolveThemePalette(parseThemeColorsToml('background = "#000000"')),
    (error) => error instanceof ThemeCatalogError && error.code === "theme-palette-incomplete",
  );
  assert.throws(
    () => assertUniqueThemeIds([{ id: "giants" }, { id: "giants" }]),
    (error) => error instanceof ThemeCatalogError && error.code === "theme-id-duplicate",
  );
});
