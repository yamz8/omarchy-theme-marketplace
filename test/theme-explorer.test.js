import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { colorHue, hexToRgb, relativeLuminance } from "../site/assets/js/theme-color.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

test("theme color projection produces stable atlas coordinates", () => {
  assert.deepEqual(hexToRgb("#ff0000"), [255, 0, 0]);
  assert.equal(colorHue("#ff0000"), 0);
  assert.equal(colorHue("#00ff00"), 120);
  assert.equal(colorHue("#0000ff"), 240);
  assert.ok(relativeLuminance("#ffffff") > relativeLuminance("#777777"));
  assert.ok(relativeLuminance("#777777") > relativeLuminance("#000000"));
});

test("generated explorer data projects the complete theme catalog", async () => {
  const [catalog, explorer] = await Promise.all([readJson("site/catalog.json"), readJson("site/explorer-data.json")]);
  assert.equal(explorer.schemaVersion, 1);
  assert.equal(explorer.themes.length, catalog.themes.length);
  assert.equal(explorer.summary.total, catalog.themes.length);
  assert.equal(explorer.summary.builtIn, catalog.themes.filter((theme) => theme.builtIn).length);
  assert.equal(explorer.summary.community, catalog.themes.filter((theme) => !theme.builtIn).length);
  assert.equal(explorer.summary.wallpapers, catalog.themes.reduce((total, theme) => total + theme.backgroundCount, 0));
  assert.ok(explorer.growth.length >= 1);
  assert.deepEqual([...explorer.growth].sort((first, second) => first.date.localeCompare(second.date)), explorer.growth);
  assert.equal(explorer.growth.at(-1).total, catalog.themes.length);
  assert.ok(explorer.themes.every((theme) => /^#[0-9a-f]{6}$/i.test(theme.accent)));
});

test("Explore exposes an accessible palette atlas and growth view", async () => {
  const [html, script, packageJson] = await Promise.all([
    read("site/explore.html"),
    read("site/assets/js/explore.js"),
    readJson("package.json"),
  ]);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="palette-atlas"/);
  assert.match(html, /id="growth-chart"/);
  assert.match(html, /Hue \+ relative luminance/);
  assert.doesNotMatch(html, /plugin|Plugin|PLUGIN/);
  assert.match(script, /createElementNS/);
  assert.match(script, /encodeURIComponent\(theme\.id\)/);
  assert.doesNotMatch(script, /innerHTML/);
  assert.equal(packageJson.scripts["build:explorer"], "node scripts/build-explorer-data.mjs");
  assert.match(packageJson.scripts.build, /build-explorer-data\.mjs/);
});
