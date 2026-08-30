import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("active marketplace pages use theme language and routes", async () => {
  const pages = await Promise.all(["index", "theme", "explore", "develop", "publish"].map((name) => read(`site/${name}.html`)));
  for (const page of pages) {
    assert.match(page, /Omarchy Theme|Omarchy theme|THEME MARKETPLACE/);
    assert.doesNotMatch(page, /plugin\.html|PLUGIN MARKETPLACE|Browse plugins|Publish a plugin/);
  }
  assert.match(pages[0], /id="theme-grid"/);
  assert.match(pages[1], /id="theme-detail"/);
});

test("browser code renders catalog values through escaping helpers", async () => {
  const [app, detail, shared] = await Promise.all([
    read("site/assets/js/app.js"),
    read("site/assets/js/theme.js"),
    read("site/assets/js/shared.js"),
  ]);
  assert.match(shared, /export function escapeHtml/);
  assert.match(shared, /\["https:", "http:"\]/);
  assert.ok((app.match(/escapeHtml\(/g) || []).length >= 12);
  assert.ok((detail.match(/escapeHtml\(/g) || []).length >= 12);
  assert.match(app, /encodeURIComponent\(theme\.id\)/);
});

test("every active page uses the same final asset versions", async () => {
  const pages = await Promise.all(["index", "theme", "explore", "develop", "publish"].map((name) => read(`site/${name}.html`)));
  for (const page of pages) assert.match(page, /style\.css\?v=20260831-02/);
  assert.match(pages[0], /app\.js\?v=20260831-02/);
  assert.match(pages[1], /theme\.js\?v=20260831-01/);
});
