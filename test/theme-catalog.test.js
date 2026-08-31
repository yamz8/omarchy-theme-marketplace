import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
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
  }
});

test("generated preview files exactly match catalog references", async () => {
  const catalog = await readJson("site/catalog.json");
  const referenced = new Set();
  for (const theme of catalog.themes) {
    for (const variant of ["card", "detail"]) {
      const path = theme.preview?.[variant];
      assert.match(path, /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/);
      referenced.add(path.split("/").at(-1));
    }
  }
  const generated = new Set(await readdir(new URL("site/assets/img/themes/", root)));
  assert.deepEqual([...generated].sort(), [...referenced].sort());
});

function catalogTheme({ id, repo, sourceType = "community", name = id, license = "MIT" }) {
  return {
    id,
    name,
    repo,
    sourceType,
    license,
    preview: {
      card: `assets/img/themes/${id}-card.webp`,
      detail: `assets/img/themes/${id}-detail.webp`,
    },
  };
}

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
