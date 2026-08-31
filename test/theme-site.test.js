import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
  assert.match(pages[0], /id="community-feature"/);
  assert.match(pages[0], /data-wallpapers="deep"/);
  assert.match(pages[1], /id="theme-detail"/);
  assert.match(pages[1], /id="aside-commit"/);
  assert.match(pages[1], /href="#related"/);
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
  assert.match(app, /safeUrl\(theme\.sourceUrl\)/);
  assert.match(app, /class="card-install builtin-source-action"/);
  assert.match(app, /target="_blank" rel="noreferrer"/);
  assert.match(app, /View source for \$\{escapeHtml\(theme\.name\)\}/);
  assert.match(app, /function wallpaperGroup/);
  assert.match(app, /renderCommunitySpotlight/);
  assert.match(detail, /function paletteDistance/);
  assert.match(detail, /Exact theme source/);
  assert.match(detail, /Compatibility is not a security review/);
});

test("every active page uses the same final asset versions", async () => {
  const pages = await Promise.all(["index", "theme", "explore", "develop", "publish"].map((name) => read(`site/${name}.html`)));
  for (const page of pages) assert.match(page, /style\.css\?v=20260831-05/);
  assert.match(pages[0], /app\.js\?v=20260831-05/);
  assert.match(pages[1], /theme\.js\?v=20260831-04/);
  assert.match(pages[2], /explore\.css\?v=20260831-01/);
  assert.match(pages[2], /explore\.js\?v=20260831-02/);
  for (const page of pages.slice(3)) assert.match(page, /static-page\.js\?v=20260831-03/);
});

test("every local page asset reference resolves inside the static site", async () => {
  for (const name of ["index", "theme", "explore", "develop", "publish"]) {
    const page = await read(`site/${name}.html`);
    const references = [...page.matchAll(/\b(?:href|src)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => value && !value.startsWith("#") && !/^[a-z]+:/i.test(value))
      .map((value) => value.split(/[?#]/, 1)[0]);
    for (const reference of references) {
      await assert.doesNotReject(
        access(new URL(`site/${reference}`, root)),
        `${name}.html references missing local asset ${reference}`,
      );
    }
  }
});
