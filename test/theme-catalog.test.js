import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  catalogSnapshotPins,
  communitySnapshotPins,
  maxCatalogWallpapers,
  mergeSelectiveThemeCatalog,
  selectiveThemeBuildPlan,
} from "../scripts/build-catalog.mjs";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("registry contains theme sources, not plugin manifests", async () => {
  const registry = await readJson("registry.json");
  assert.equal(registry.schemaVersion, 1);
  assert.ok(registry.builtInSources.some((source) => source.repo === "https://github.com/omacom/omarchy" && source.themeRoot === "themes"));
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
    assert.ok(Array.isArray(theme.wallpapers));
    assert.ok(theme.wallpapers.length > 0);
    assert.equal(theme.wallpapers.length, Math.min(theme.backgroundCount, maxCatalogWallpapers));
    assert.equal(theme.wallpaperGalleryTruncated, theme.backgroundCount > maxCatalogWallpapers);
    for (const wallpaper of theme.wallpapers) {
      assert.match(wallpaper.sourcePath, /(?:^|\/)backgrounds\/[^/]+$/i);
      assert.ok(wallpaper.thumbnail?.startsWith("assets/img/themes/"));
      assert.ok(wallpaper.detail?.startsWith("assets/img/themes/"));
    }
  }
});

test("generated theme images exactly match catalog references", async () => {
  const catalog = await readJson("site/catalog.json");
  const referenced = new Set();
  for (const theme of catalog.themes) {
    const paths = [
      theme.preview?.card,
      theme.preview?.detail,
      ...theme.wallpapers.flatMap((wallpaper) => [wallpaper.thumbnail, wallpaper.detail]),
    ];
    for (const path of paths) {
      assert.match(path, /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/);
      referenced.add(path.split("/").at(-1));
    }
  }
  const generated = new Set(await readdir(new URL("site/assets/img/themes/", root)));
  assert.deepEqual([...generated].sort(), [...referenced].sort());
});

function catalogTheme({ id, repo, sourceType = "community", name = id, license = "MIT", checkedCommit = "a".repeat(40) }) {
  return {
    id,
    name,
    repo,
    sourceType,
    license,
    checkedCommit,
    preview: {
      card: `assets/img/themes/${id}-card.webp`,
      detail: `assets/img/themes/${id}-detail.webp`,
    },
  };
}

test("full pinned catalog rebuilds bind every source to committed snapshot evidence", () => {
  const builtInRepo = "https://github.com/omacom/omarchy";
  const communityRepo = "https://github.com/example/omarchy-canyon-theme";
  const registry = {
    schemaVersion: 1,
    builtInSources: [{ repo: builtInRepo }],
    sources: [{ repo: communityRepo }],
  };
  const previousCatalog = {
    schemaVersion: 1,
    themes: [
      catalogTheme({ id: "catppuccin", repo: builtInRepo, sourceType: "builtin", checkedCommit: "b".repeat(40) }),
      catalogTheme({ id: "tokyo-night", repo: builtInRepo, sourceType: "builtin", checkedCommit: "b".repeat(40) }),
      catalogTheme({ id: "canyon", repo: communityRepo, checkedCommit: "c".repeat(40) }),
    ],
  };
  const pins = catalogSnapshotPins(registry, previousCatalog);
  assert.equal(pins.commits.get("omacom/omarchy"), "b".repeat(40));
  assert.equal(pins.commits.get("example/omarchy-canyon-theme"), "c".repeat(40));
  assert.equal(pins.themesById.get("tokyo-night").sourceType, "builtin");
});

function selectiveFixture({ includeTarget = false } = {}) {
  const builtInRepo = "https://github.com/omacom/omarchy";
  const preservedRepo = "https://github.com/example/omarchy-preserved-theme";
  const targetRepo = "https://github.com/example/omarchy-canyon-theme";
  const registry = {
    schemaVersion: 1,
    retiredThemeIds: [],
    builtInSources: [{ repo: builtInRepo, themeRoot: "themes" }],
    sources: [{ repo: preservedRepo }, { repo: targetRepo }],
  };
  const themes = [
    catalogTheme({ id: "tokyo-night", repo: builtInRepo, sourceType: "builtin" }),
    catalogTheme({ id: "preserved", repo: preservedRepo }),
  ];
  if (includeTarget) themes.push(catalogTheme({ id: "canyon", repo: targetRepo }));
  return {
    registry,
    targetRepo,
    previousCatalog: { schemaVersion: 1, themes },
  };
}

test("selective catalog builds preserve unrelated records and replace only their target", () => {
  const fixture = selectiveFixture({ includeTarget: true });
  const plan = selectiveThemeBuildPlan(fixture.registry, fixture.previousCatalog, fixture.targetRepo);
  assert.equal(plan.targetSource.repo, fixture.targetRepo);
  assert.equal(plan.previousTargetTheme.id, "canyon");
  assert.strictEqual(plan.preservedThemes[0], fixture.previousCatalog.themes[0]);
  assert.strictEqual(plan.preservedThemes[1], fixture.previousCatalog.themes[1]);

  const refreshed = catalogTheme({
    id: "canyon",
    repo: fixture.targetRepo,
    name: "Refreshed Canyon",
    license: "Not declared",
  });
  const catalog = mergeSelectiveThemeCatalog(
    fixture.registry,
    fixture.previousCatalog,
    fixture.targetRepo,
    refreshed,
    "2026-08-31T12:00:00.000Z",
  );
  assert.equal(catalog.generatedAt, "2026-08-31T12:00:00.000Z");
  assert.equal(catalog.themes.find((theme) => theme.id === "canyon"), refreshed);
  assert.equal(catalog.themes.find((theme) => theme.id === "preserved"), fixture.previousCatalog.themes[1]);
  assert.deepEqual(catalog.warnings, ["Refreshed Canyon: upstream repository does not declare a license."]);
});

test("selective catalog builds accept a new target but fail closed on incomplete prior state", () => {
  const fixture = selectiveFixture();
  const refreshed = catalogTheme({ id: "canyon", repo: fixture.targetRepo });
  const catalog = mergeSelectiveThemeCatalog(
    fixture.registry,
    fixture.previousCatalog,
    fixture.targetRepo,
    refreshed,
  );
  assert.ok(catalog.themes.some((theme) => theme.id === "canyon"));

  assert.throws(
    () => selectiveThemeBuildPlan(
      fixture.registry,
      { ...fixture.previousCatalog, themes: fixture.previousCatalog.themes.slice(0, 1) },
      fixture.targetRepo,
    ),
    /does not exactly cover community theme source/,
  );
  assert.throws(
    () => selectiveThemeBuildPlan(
      fixture.registry,
      {
        ...fixture.previousCatalog,
        themes: [...fixture.previousCatalog.themes, catalogTheme({
          id: "stale",
          repo: "https://github.com/example/omarchy-stale-theme",
        })],
      },
      fixture.targetRepo,
    ),
    /stale or mismatched theme source/,
  );
});

test("selective catalog builds reject slug changes, collisions, and retired IDs", () => {
  const fixture = selectiveFixture({ includeTarget: true });
  assert.throws(
    () => mergeSelectiveThemeCatalog(
      fixture.registry,
      fixture.previousCatalog,
      fixture.targetRepo,
      catalogTheme({ id: "renamed", repo: fixture.targetRepo }),
    ),
    /changed its installed slug/,
  );
  assert.throws(
    () => mergeSelectiveThemeCatalog(
      fixture.registry,
      fixture.previousCatalog,
      fixture.targetRepo,
      catalogTheme({ id: "preserved", repo: fixture.targetRepo }),
    ),
    /changed its installed slug/,
  );

  const newFixture = selectiveFixture();
  assert.throws(
    () => mergeSelectiveThemeCatalog(
      newFixture.registry,
      newFixture.previousCatalog,
      newFixture.targetRepo,
      catalogTheme({ id: "preserved", repo: newFixture.targetRepo }),
    ),
    /Duplicate Omarchy theme ID/,
  );
  newFixture.registry.retiredThemeIds = ["canyon"];
  assert.throws(
    () => mergeSelectiveThemeCatalog(
      newFixture.registry,
      newFixture.previousCatalog,
      newFixture.targetRepo,
      catalogTheme({ id: "canyon", repo: newFixture.targetRepo }),
    ),
    /retired and cannot be republished/,
  );
});

test("selective catalog builds replace one historical migration path without unrelated drift", () => {
  const builtInRepo = "https://github.com/omacom/omarchy";
  const preservedRepo = "https://github.com/example/omarchy-preserved-theme";
  const previousRepo = "https://github.com/example/omarchy-canyon-theme";
  const nextRepo = "https://github.com/example/canyon-theme";
  const registry = {
    schemaVersion: 1,
    retiredThemeIds: [],
    builtInSources: [{ repo: builtInRepo, themeRoot: "themes" }],
    sources: [{ repo: preservedRepo }, { repo: nextRepo }],
  };
  const previousCatalog = {
    schemaVersion: 1,
    themes: [
      catalogTheme({ id: "tokyo-night", repo: builtInRepo, sourceType: "builtin" }),
      catalogTheme({ id: "preserved", repo: preservedRepo }),
      catalogTheme({ id: "canyon", repo: previousRepo }),
    ],
  };
  const plan = selectiveThemeBuildPlan(registry, previousCatalog, nextRepo, {
    previousRepository: previousRepo,
  });
  assert.equal(plan.previousTargetTheme.repo, previousRepo);
  assert.equal(plan.preservedThemes.length, 2);

  const refreshed = catalogTheme({ id: "canyon", repo: nextRepo, name: "Canonical Canyon" });
  const catalog = mergeSelectiveThemeCatalog(
    registry,
    previousCatalog,
    nextRepo,
    refreshed,
    "2026-08-31T12:00:00.000Z",
    { previousRepository: previousRepo },
  );
  assert.equal(catalog.themes.find((theme) => theme.id === "canyon"), refreshed);
  assert.equal(catalog.themes.find((theme) => theme.id === "preserved"), previousCatalog.themes[1]);
  assert.equal(catalog.themes.some((theme) => theme.repo === previousRepo), false);

  assert.throws(
    () => selectiveThemeBuildPlan(registry, {
      ...previousCatalog,
      themes: previousCatalog.themes.slice(0, 2),
    }, nextRepo, { previousRepository: previousRepo }),
    /does not exactly cover historical migration source/,
  );
});

test("scheduled refresh pins every active community source to its published catalog commit", () => {
  const firstRepo = "https://github.com/example/omarchy-canyon-theme";
  const secondRepo = "https://github.com/example/omarchy-forest-theme";
  const registry = { sources: [{ repo: firstRepo }, { repo: secondRepo }] };
  const catalog = {
    schemaVersion: 1,
    themes: [
      catalogTheme({ id: "tokyo-night", repo: "https://github.com/omacom/omarchy", sourceType: "builtin" }),
      { ...catalogTheme({ id: "canyon", repo: firstRepo }), checkedCommit: "a".repeat(40) },
      { ...catalogTheme({ id: "forest", repo: secondRepo }), checkedCommit: "b".repeat(40) },
    ],
  };
  const pins = communitySnapshotPins(registry, catalog);
  assert.equal(pins.get("example/omarchy-canyon-theme"), "a".repeat(40));
  assert.equal(pins.get("example/omarchy-forest-theme"), "b".repeat(40));

  assert.throws(
    () => communitySnapshotPins(registry, { ...catalog, themes: catalog.themes.slice(0, 2) }),
    /missing an active source/,
  );
  assert.throws(
    () => communitySnapshotPins({ sources: registry.sources.slice(0, 1) }, catalog),
    /stale or ambiguous source/,
  );
  assert.throws(
    () => communitySnapshotPins(registry, {
      ...catalog,
      themes: catalog.themes.map((theme) => theme.id === "canyon" ? { ...theme, checkedCommit: "short" } : theme),
    }),
    /commit is invalid/,
  );
});
