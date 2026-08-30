import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("registry contains theme sources, not plugin manifests", async () => {
  const registry = await readJson("registry.json");
  assert.equal(registry.schemaVersion, 1);
  assert.ok(registry.builtInSources.some((source) => source.themeRoot === "themes"));
  assert.ok(registry.sources.some((source) => source.repo === "https://github.com/dhh/omarchy-giants-theme"));
  assert.equal(Object.hasOwn(registry, "plugins"), false);
});

test("generated catalog contains unique, installable Omarchy themes", async () => {
  const catalog = await readJson("site/catalog.json");
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(catalog.themes.length >= 20);
  assert.equal(new Set(catalog.themes.map((theme) => theme.id)).size, catalog.themes.length);

  const builtIn = catalog.themes.find((theme) => theme.id === "tokyo-night");
  const giants = catalog.themes.find((theme) => theme.id === "giants");
  assert.equal(builtIn.officialCommand, "omarchy theme set tokyo-night");
  assert.equal(giants.installCommand, "omarchy theme install https://github.com/dhh/omarchy-giants-theme");
  assert.equal(giants.sourceType, "community");

  for (const theme of catalog.themes) {
    assert.match(theme.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(["dark", "light"].includes(theme.mode));
    assert.match(theme.checkedCommit, /^[0-9a-f]{40}$/);
    assert.ok(theme.preview?.card?.startsWith("assets/img/themes/"));
    assert.ok(theme.preview?.detail?.startsWith("assets/img/themes/"));
  }
});
