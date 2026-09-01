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
  assert.match(pages[0], /Community registry/);
  assert.match(pages[0], /discover omarchy themes/);
  assert.match(pages[0], /Browse built-in and community themes for/);
  assert.match(pages[0], /Inspect the source, preview the wallpapers, copy the command/);
  assert.match(pages[0], /Develop a theme/);
  assert.match(pages[1], /id="theme-detail"/);
  assert.match(pages[1], /id="aside-commit"/);
  assert.match(pages[1], /href="#wallpapers"/);
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
  assert.match(detail, /function wallpaperGallery/);
  assert.match(detail, /function setupWallpaperGallery/);
  assert.match(detail, /data-wallpaper-previous/);
  assert.match(detail, /data-wallpaper-next/);
  assert.match(detail, /aria-pressed=/);
  assert.match(detail, /ArrowLeft/);
  assert.match(detail, /ArrowRight/);
  assert.match(detail, /pointerType !== "mouse"/);
  assert.match(detail, /prefers-reduced-motion: reduce/);
  assert.match(detail, /Exact theme source/);
  assert.match(detail, /Compatibility is not a security review/);
});

test("theme detail wallpaper gallery uses the shared restrained visual system", async () => {
  const styles = await read("site/assets/css/style.css");
  assert.match(styles, /\.wallpaper-stage\s*\{[^}]*aspect-ratio:\s*16 \/ 9;/);
  assert.match(styles, /\.wallpaper-stage\s*\{[^}]*touch-action:\s*pan-y;/);
  assert.match(styles, /\.wallpaper-controls\s*\{[^}]*grid-template-columns:/);
  assert.match(styles, /\.wallpaper-thumbnails\s*\{[^}]*overflow-x:\s*auto;/);
  assert.match(styles, /\.wallpaper-thumbnail\[aria-pressed="true"\]/);
  assert.match(styles, /\.wallpaper-step:disabled/);
});

test("theme cards balance source, engagement, and commands around visible traits", async () => {
  const [app, styles] = await Promise.all([
    read("site/assets/js/app.js"),
    read("site/assets/css/style.css"),
  ]);
  assert.match(app, /<div class="theme-card-bottom">\s*<div class="theme-card-meta">\s*<div class="theme-tags"[^>]*>/s);
  assert.match(app, /<div class="theme-card-meta-actions">\$\{sourceAction\}\$\{state\.engagementEnabled \? "" : commandAction\}<\/div>/);
  assert.match(app, /\$\{state\.engagementEnabled \? `<div class="theme-card-actions">\$\{engagementAction\}\$\{commandAction\}<\/div>` : ""\}/);
  assert.match(app, /class="card-install has-control-tooltip"/);
  assert.match(app, /class="control-tooltip" role="tooltip" aria-hidden="true"/);
  assert.match(app, /state\.engagementEnabled \? "" : commandAction/);
  assert.match(app, /state\.engagementEnabled = false;\s*hidePendingEngagement\(document\);\s*renderCommunitySpotlight\(\);\s*render\(\);/);
  assert.match(styles, /\.theme-card-bottom\s*\{[^}]*display:\s*grid;/);
  assert.match(styles, /\.theme-card-meta\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(styles, /\.theme-card-meta \.theme-tags\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(styles, /\.theme-card-meta-actions\s*\{[^}]*margin-left:\s*auto;/);
  assert.match(styles, /\.theme-card-actions\s*\{[^}]*justify-content:\s*space-between;/);
  assert.doesNotMatch(styles, /\.theme-card-meta \.theme-tags\s*\{[^}]*(?:display:\s*none|overflow:\s*hidden)/);
});

test("hero actions keep labels and arrows together", async () => {
  const styles = await read("site/assets/css/style.css");
  assert.match(styles, /\.market-hero-actions\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(styles, /\.market-hero-actions \.button\s*\{[^}]*white-space:\s*nowrap;/);
});

test("every active page uses the same final asset versions", async () => {
  const pages = await Promise.all(["index", "theme", "explore", "develop", "publish"].map((name) => read(`site/${name}.html`)));
  for (const page of pages) assert.match(page, /style\.css\?v=20260901-01/);
  assert.match(pages[0], /app\.js\?v=20260831-07/);
  assert.match(pages[1], /theme\.js\?v=20260831-09/);
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
