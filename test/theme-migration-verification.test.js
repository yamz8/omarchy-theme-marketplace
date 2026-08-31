import assert from "node:assert/strict";
import test from "node:test";
import { verifyThemeMigrationProjection } from "../scripts/verify-theme-migration.mjs";

const oldRepo = "https://github.com/example/omarchy-canyon-theme";
const newRepo = "https://github.com/example/canyon-theme";
const previousCommit = "a".repeat(40);
const headCommit = "b".repeat(40);

function fixture() {
  const baseSource = { repo: oldRepo, name: "Canyon", listingUpdatedCommit: previousCommit };
  const otherSource = { repo: "https://github.com/example/omarchy-forest-theme", name: "Forest" };
  const baseTheme = {
    id: "canyon",
    name: "Canyon",
    repo: oldRepo,
    sourceType: "community",
    license: "MIT",
    checkedCommit: previousCommit,
    checkedBranch: "main",
    checkedAt: "2026-08-31T10:00:00.000Z",
    preview: { card: "assets/img/themes/canyon-a-card.webp", detail: "assets/img/themes/canyon-a-detail.webp" },
    wallpapers: [{ sourcePath: "backgrounds/canyon.webp", thumbnail: "assets/img/themes/canyon-a-wallpaper-thumbnail.webp", detail: "assets/img/themes/canyon-a-wallpaper-detail.webp" }],
  };
  const otherTheme = {
    id: "forest",
    name: "Forest",
    repo: otherSource.repo,
    sourceType: "community",
    license: "MIT",
    checkedCommit: "c".repeat(40),
    checkedBranch: "main",
    checkedAt: "2026-08-31T10:00:00.000Z",
    preview: { card: "assets/img/themes/forest-card.webp", detail: "assets/img/themes/forest-detail.webp" },
    wallpapers: [{ sourcePath: "backgrounds/forest.webp", thumbnail: "assets/img/themes/forest-wallpaper-thumbnail.webp", detail: "assets/img/themes/forest-wallpaper-detail.webp" }],
  };
  const report = {
    schemaVersion: 1,
    themeId: "canyon",
    fromRepository: oldRepo,
    toRepository: newRepo,
    previousCatalogCommit: previousCommit,
    observedHeadCommit: headCommit,
    observedBranch: "main",
    observedAt: "2026-08-31T11:00:00.000Z",
    nodeId: "R_kgDOCanyon",
    databaseId: 123456,
  };
  const migration = {
    schemaVersion: 1,
    themeId: "canyon",
    fromRepository: "example/omarchy-canyon-theme",
    toRepository: "example/canyon-theme",
    nodeId: report.nodeId,
    databaseId: report.databaseId,
    previousCatalogCommit: previousCommit,
    observedHeadCommit: headCommit,
    observedBranch: "main",
    observedAt: report.observedAt,
  };
  const nextSource = {
    ...baseSource,
    repo: newRepo,
    listingUpdatedRepository: oldRepo,
    repositoryIdentity: {
      schemaVersion: 1,
      nodeId: report.nodeId,
      databaseId: report.databaseId,
      previousRepositories: ["example/omarchy-canyon-theme"],
    },
  };
  return {
    baseRegistry: { schemaVersion: 1, retiredThemeIds: [], repositoryMigrations: [], builtInSources: [], sources: [baseSource, otherSource] },
    nextRegistry: { schemaVersion: 1, retiredThemeIds: [], repositoryMigrations: [migration], builtInSources: [], sources: [nextSource, otherSource] },
    baseCatalog: { generatedAt: "2026-08-31T10:30:00.000Z", schemaVersion: 1, mode: "live", themes: [baseTheme, otherTheme], warnings: [] },
    nextCatalog: {
      generatedAt: "2026-08-31T11:01:00.000Z",
      schemaVersion: 1,
      mode: "live",
      themes: [{
        ...baseTheme,
        repo: newRepo,
        checkedCommit: headCommit,
        preview: { card: "assets/img/themes/canyon-b-card.webp", detail: "assets/img/themes/canyon-b-detail.webp" },
        wallpapers: [{ sourcePath: "backgrounds/canyon.webp", thumbnail: "assets/img/themes/canyon-b-wallpaper-thumbnail.webp", detail: "assets/img/themes/canyon-b-wallpaper-detail.webp" }],
      }, otherTheme],
      warnings: [],
    },
    report,
  };
}

test("migration verification accepts one canonical path replacement with unrelated state intact", () => {
  const value = fixture();
  const result = verifyThemeMigrationProjection(
    value.baseRegistry,
    value.baseCatalog,
    value.nextRegistry,
    value.nextCatalog,
    value.report,
    { themeId: "canyon", newRepository: newRepo },
  );
  assert.equal(result.nextTheme.repo, newRepo);
  assert.deepEqual([...result.unrelatedPreviewNames].sort(), [
    "forest-card.webp",
    "forest-detail.webp",
    "forest-wallpaper-detail.webp",
    "forest-wallpaper-thumbnail.webp",
  ]);
});

test("migration verification rejects promoted evidence and unrelated catalog or registry drift", () => {
  const value = fixture();
  assert.throws(
    () => verifyThemeMigrationProjection(
      value.baseRegistry,
      value.baseCatalog,
      { ...value.nextRegistry, sources: [{ ...value.nextRegistry.sources[0], listingUpdatedCommit: headCommit }, value.nextRegistry.sources[1]] },
      value.nextCatalog,
      value.report,
      { themeId: "canyon", newRepository: newRepo },
    ),
    /changed source metadata or snapshot evidence/,
  );
  assert.throws(
    () => verifyThemeMigrationProjection(
      value.baseRegistry,
      value.baseCatalog,
      value.nextRegistry,
      { ...value.nextCatalog, themes: value.nextCatalog.themes.map((theme) => theme.id === "forest" ? { ...theme, name: "Changed" } : theme) },
      value.report,
      { themeId: "canyon", newRepository: newRepo },
    ),
    /unrelated catalog record/,
  );
  assert.throws(
    () => verifyThemeMigrationProjection(
      value.baseRegistry,
      value.baseCatalog,
      { ...value.nextRegistry, retiredThemeIds: ["unexpected"] },
      value.nextCatalog,
      value.report,
      { themeId: "canyon", newRepository: newRepo },
    ),
    /unrelated registry state/,
  );
});
