import assert from "node:assert/strict";
import test from "node:test";
import { verifyThemeUpdateProjection } from "../scripts/verify-theme-update.mjs";

const previousCommit = "a".repeat(40);
const updatedCommit = "b".repeat(40);
const repository = "https://github.com/example/omarchy-canyon-theme";
const unrelatedRepository = "https://github.com/example/omarchy-forest-theme";

function theme(id, repo, commit) {
  return {
    id,
    name: id,
    repo,
    sourceType: "community",
    license: "MIT",
    checkedCommit: commit,
    checkedBranch: "main",
    checkedAt: "2026-08-31T10:00:00.000Z",
    preview: {
      card: `assets/img/themes/${id}-${commit[0]}-card.webp`,
      detail: `assets/img/themes/${id}-${commit[0]}-detail.webp`,
    },
  };
}

function fixture() {
  const baseSource = { repo: repository, name: "Canyon" };
  const unrelatedSource = { repo: unrelatedRepository, name: "Forest" };
  const baseTheme = theme("canyon", repository, previousCommit);
  const unrelatedTheme = theme("forest", unrelatedRepository, "c".repeat(40));
  const report = {
    schemaVersion: 1,
    themeId: "canyon",
    repository,
    previousCommit,
    updatedCommit,
    updatedBranch: "main",
    updatedAt: "2026-08-31T11:00:00.000Z",
    updatedBy: "yamz8",
    testedOmarchyVersion: "4.0.1",
  };
  const nextSource = {
    ...baseSource,
    testedOmarchyVersion: report.testedOmarchyVersion,
    listingUpdatedRepository: repository,
    listingUpdatedCommit: updatedCommit,
    listingUpdatedBranch: "main",
    listingUpdatedAt: report.updatedAt,
    listingUpdatedBy: report.updatedBy,
    listingUpdateHistory: [{
      repository,
      commit: previousCommit,
      branch: "main",
      checkedAt: baseTheme.checkedAt,
      supersededAt: report.updatedAt,
    }],
  };
  return {
    baseRegistry: {
      schemaVersion: 1,
      retiredThemeIds: [],
      repositoryMigrations: [],
      builtInSources: [],
      sources: [baseSource, unrelatedSource],
    },
    nextRegistry: {
      schemaVersion: 1,
      retiredThemeIds: [],
      repositoryMigrations: [],
      builtInSources: [],
      sources: [nextSource, unrelatedSource],
    },
    baseCatalog: {
      generatedAt: "2026-08-31T10:30:00.000Z",
      schemaVersion: 1,
      mode: "live",
      themes: [baseTheme, unrelatedTheme],
      warnings: [],
    },
    nextCatalog: {
      generatedAt: "2026-08-31T11:01:00.000Z",
      schemaVersion: 1,
      mode: "live",
      themes: [theme("canyon", repository, updatedCommit), unrelatedTheme],
      warnings: [],
    },
    report,
    expected: {
      themeId: "canyon",
      commit: updatedCommit,
      updatedBy: "yamz8",
      testedOmarchyVersion: "4.0.1",
    },
  };
}

test("update verification accepts one exact target projection with unrelated identity intact", () => {
  const value = fixture();
  const result = verifyThemeUpdateProjection(
    value.baseRegistry,
    value.baseCatalog,
    value.nextRegistry,
    value.nextCatalog,
    value.report,
    value.expected,
  );
  assert.equal(result.nextTheme.checkedCommit, updatedCommit);
  assert.deepEqual([...result.unrelatedPreviewNames].sort(), ["forest-c-card.webp", "forest-c-detail.webp"]);
});

test("update verification rejects unrelated catalog, registry, report, and archive drift", () => {
  const value = fixture();
  assert.throws(
    () => verifyThemeUpdateProjection(
      value.baseRegistry,
      value.baseCatalog,
      value.nextRegistry,
      { ...value.nextCatalog, themes: value.nextCatalog.themes.map((entry) => entry.id === "forest" ? { ...entry, name: "Changed" } : entry) },
      value.report,
      value.expected,
    ),
    /unrelated catalog record/,
  );
  assert.throws(
    () => verifyThemeUpdateProjection(
      value.baseRegistry,
      value.baseCatalog,
      { ...value.nextRegistry, retiredThemeIds: ["unexpected"] },
      value.nextCatalog,
      value.report,
      value.expected,
    ),
    /outside community sources/,
  );
  assert.throws(
    () => verifyThemeUpdateProjection(
      value.baseRegistry,
      value.baseCatalog,
      value.nextRegistry,
      value.nextCatalog,
      { ...value.report, updatedBy: "someone-else" },
      value.expected,
    ),
    /authorized request/,
  );
  const brokenSource = {
    ...value.nextRegistry.sources[0],
    listingUpdateHistory: [{
      ...value.nextRegistry.sources[0].listingUpdateHistory[0],
      commit: "d".repeat(40),
    }],
  };
  assert.throws(
    () => verifyThemeUpdateProjection(
      value.baseRegistry,
      value.baseCatalog,
      { ...value.nextRegistry, sources: [brokenSource, value.nextRegistry.sources[1]] },
      value.nextCatalog,
      value.report,
      value.expected,
    ),
    /archive the exact previous/,
  );
});
