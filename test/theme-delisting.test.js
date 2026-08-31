import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyThemeDelisting,
  parseThemeIds,
  planThemeDelisting,
} from "../scripts/delist-themes.mjs";

const previousGeneratedAt = "2026-08-31T10:00:00.000Z";
const nextGeneratedAt = "2026-08-31T11:00:00.000Z";

function source(repo) {
  return { repo, addedAt: "2026-08-31", listingApprovedCommit: "a".repeat(40) };
}

function theme(id, repo, { sourceType = "community", license = "MIT" } = {}) {
  return {
    id,
    name: id,
    repo,
    sourceType,
    license,
    preview: {
      card: `assets/img/themes/${id}-card.webp`,
      detail: `assets/img/themes/${id}-detail.webp`,
    },
  };
}

function fixture() {
  const builtInRepo = "https://github.com/omacom/omarchy";
  const targetRepo = "https://github.com/example/omarchy-target-theme";
  const retainedRepo = "https://github.com/example/omarchy-retained-theme";
  return {
    targetRepo,
    retainedRepo,
    registry: {
      schemaVersion: 1,
      retiredThemeIds: ["retired"],
      repositoryMigrations: [],
      builtInSources: [{ repo: builtInRepo, themeRoot: "themes" }],
      sources: [source(targetRepo), source(retainedRepo)],
    },
    catalog: {
      generatedAt: previousGeneratedAt,
      schemaVersion: 1,
      mode: "live",
      themes: [
        theme("tokyo-night", builtInRepo, { sourceType: "builtin" }),
        theme("target", targetRepo, { license: "Not declared" }),
        theme("retained", retainedRepo),
      ],
      warnings: ["target: upstream repository does not declare a license."],
    },
  };
}

test("delisting input requires unique bounded native theme IDs", () => {
  assert.deepEqual(parseThemeIds("two, one\n"), ["one", "two"]);
  assert.throws(() => parseThemeIds(""), /at least one/);
  assert.throws(() => parseThemeIds("one one"), /must not be repeated/);
  assert.throws(() => parseThemeIds("Invalid Theme"), /Invalid theme ID/);
  assert.throws(() => parseThemeIds(Array.from({ length: 21 }, (_, index) => `theme-${index}`).join(" ")), /at most 20/);
});

test("a theme delisting plan removes one complete source without unrelated drift", () => {
  const value = fixture();
  const result = planThemeDelisting(value.registry, value.catalog, ["target"], {
    generatedAt: nextGeneratedAt,
    requestedBy: "yamz8",
  });

  assert.deepEqual(result.nextRegistry.sources, value.registry.sources.slice(1));
  assert.deepEqual(result.nextRegistry.retiredThemeIds, ["retired", "target"]);
  assert.deepEqual(result.nextCatalog.themes, [value.catalog.themes[0], value.catalog.themes[2]]);
  assert.deepEqual(result.nextCatalog.warnings, []);
  assert.equal(result.nextCatalog.generatedAt, nextGeneratedAt);
  assert.deepEqual(result.report, {
    schemaVersion: 1,
    requestedBy: "yamz8",
    generatedAt: nextGeneratedAt,
    themeIds: ["target"],
    repositories: [value.targetRepo],
    removedThemeCount: 1,
    removedSourceCount: 1,
    removedWarningCount: 1,
    removedPreviewPaths: [
      "assets/img/themes/target-card.webp",
      "assets/img/themes/target-detail.webp",
    ],
    commitSubject: "Delist target theme",
  });
  assert.deepEqual(value.registry.retiredThemeIds, ["retired"]);
  assert.equal(value.catalog.themes.length, 3);
});

test("theme delisting fails closed on retired, missing, mismatched, shared, or stale state", () => {
  const value = fixture();
  assert.throws(
    () => planThemeDelisting(value.registry, value.catalog, ["retired"], { generatedAt: nextGeneratedAt }),
    /already retired/,
  );
  assert.throws(
    () => planThemeDelisting(value.registry, value.catalog, ["missing"], { generatedAt: nextGeneratedAt }),
    /not an active registry listing/,
  );
  assert.throws(
    () => planThemeDelisting(value.registry, {
      ...value.catalog,
      themes: value.catalog.themes.map((entry) => entry.id === "target"
        ? { ...entry, repo: value.retainedRepo }
        : entry),
    }, ["target"], { generatedAt: nextGeneratedAt }),
    /stale community theme source|does not match the active registry source/,
  );
  assert.throws(
    () => planThemeDelisting(value.registry, {
      ...value.catalog,
      themes: value.catalog.themes.map((entry) => entry.id === "retained"
        ? { ...entry, preview: { ...entry.preview, detail: "assets/img/themes/target-detail.webp" } }
        : entry),
    }, ["target"], { generatedAt: nextGeneratedAt }),
    /Preview is shared/,
  );
  assert.throws(
    () => planThemeDelisting(value.registry, value.catalog, ["target"], { generatedAt: previousGeneratedAt }),
    /must be newer/,
  );
});

test("the theme delisting writer removes only the planned preview files", async () => {
  const value = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "theme-delisting-"));
  const previewDirectory = path.join(directory, "site", "assets", "img", "themes");
  const registryPath = path.join(directory, "registry.json");
  const catalogPath = path.join(directory, "site", "catalog.json");
  const reportPath = path.join(directory, "report.json");
  try {
    await mkdir(previewDirectory, { recursive: true });
    await writeFile(registryPath, `${JSON.stringify(value.registry, null, 2)}\n`);
    await writeFile(catalogPath, `${JSON.stringify(value.catalog, null, 2)}\n`);
    for (const entry of value.catalog.themes) {
      await writeFile(path.join(directory, "site", entry.preview.card), `${entry.id} card\n`);
      await writeFile(path.join(directory, "site", entry.preview.detail), `${entry.id} detail\n`);
    }

    const report = await applyThemeDelisting({
      registryPath,
      catalogPath,
      previewDirectory,
      reportPath,
      themeIds: ["target"],
      generatedAt: nextGeneratedAt,
      requestedBy: "yamz8",
    });
    const nextRegistry = JSON.parse(await readFile(registryPath, "utf8"));
    const nextCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
    assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), report);
    assert.equal(nextRegistry.sources.some(({ repo }) => repo === value.targetRepo), false);
    assert.equal(nextCatalog.themes.some(({ id }) => id === "target"), false);
    assert.equal(existsSync(path.join(previewDirectory, "target-card.webp")), false);
    assert.equal(existsSync(path.join(previewDirectory, "target-detail.webp")), false);
    assert.equal(existsSync(path.join(previewDirectory, "retained-card.webp")), true);
    assert.equal(existsSync(path.join(previewDirectory, "retained-detail.webp")), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the theme delisting writer rejects symbolic-link preview boundaries", async () => {
  const value = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "theme-delisting-links-"));
  const realPreviewDirectory = path.join(directory, "real-previews");
  const linkedPreviewDirectory = path.join(directory, "linked-previews");
  const registryPath = path.join(directory, "registry.json");
  const catalogPath = path.join(directory, "catalog.json");
  try {
    await mkdir(realPreviewDirectory);
    await writeFile(registryPath, `${JSON.stringify(value.registry, null, 2)}\n`);
    await writeFile(catalogPath, `${JSON.stringify(value.catalog, null, 2)}\n`);
    await writeFile(path.join(realPreviewDirectory, "target-card.webp"), "card\n");
    await writeFile(path.join(realPreviewDirectory, "target-detail.webp"), "detail\n");
    await symlink(realPreviewDirectory, linkedPreviewDirectory, "dir");
    await assert.rejects(() => applyThemeDelisting({
      registryPath,
      catalogPath,
      previewDirectory: linkedPreviewDirectory,
      reportPath: path.join(directory, "linked-report.json"),
      themeIds: ["target"],
      generatedAt: nextGeneratedAt,
    }), /real directory without symbolic links/);

    await rm(linkedPreviewDirectory);
    await rm(path.join(realPreviewDirectory, "target-detail.webp"));
    await symlink(path.join(realPreviewDirectory, "target-card.webp"), path.join(realPreviewDirectory, "target-detail.webp"));
    await assert.rejects(() => applyThemeDelisting({
      registryPath,
      catalogPath,
      previewDirectory: realPreviewDirectory,
      reportPath: path.join(directory, "target-report.json"),
      themeIds: ["target"],
      generatedAt: nextGeneratedAt,
    }), /Preview is not a regular file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
