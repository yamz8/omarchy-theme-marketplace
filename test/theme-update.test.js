import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { planThemeUpdate, updateThemeSource } from "../scripts/update-theme-source.mjs";

const currentCommit = "a".repeat(40);
const nextCommit = "b".repeat(40);
const currentCheckedAt = "2026-08-31T10:00:00.000Z";
const updateAt = "2026-08-31T11:00:00.000Z";
const targetRepo = "https://github.com/example/omarchy-canyon-theme";
const retainedRepo = "https://github.com/example/omarchy-retained-theme";

function fixture() {
  const targetSource = {
    repo: targetRepo,
    name: "Canyon",
    license: "MIT",
    listingApprovedCommit: "0".repeat(40),
  };
  const retainedSource = { repo: retainedRepo, name: "Retained" };
  return {
    targetSource,
    retainedSource,
    registry: {
      schemaVersion: 1,
      retiredThemeIds: [],
      repositoryMigrations: [],
      builtInSources: [{ repo: "https://github.com/omacom/omarchy", themeRoot: "themes" }],
      sources: [targetSource, retainedSource],
    },
    catalog: {
      generatedAt: "2026-08-31T10:30:00.000Z",
      schemaVersion: 1,
      themes: [
        {
          id: "canyon",
          repo: targetRepo,
          sourceType: "community",
          checkedCommit: currentCommit,
          checkedBranch: "main",
          checkedAt: currentCheckedAt,
        },
        {
          id: "retained",
          repo: retainedRepo,
          sourceType: "community",
          checkedCommit: "c".repeat(40),
          checkedBranch: "main",
          checkedAt: currentCheckedAt,
        },
      ],
    },
    validation: {
      repository: targetRepo,
      themeId: "canyon",
      commit: nextCommit,
      branch: "main",
      license: "Apache-2.0",
      ignoredFiles: ["setup.lua"],
      warnings: ["Omarchy filters setup.lua."],
    },
  };
}

function options() {
  return {
    updatedAt: updateAt,
    updatedBy: "yamz8",
    testedOmarchyVersion: "4.0.1",
  };
}

test("theme updates archive the exact prior snapshot and preserve unrelated sources", () => {
  const value = fixture();
  const result = planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, options());

  assert.strictEqual(result.nextRegistry.sources[1], value.retainedSource);
  assert.equal(result.nextSource.listingApprovedCommit, "0".repeat(40));
  assert.equal(result.nextSource.listingUpdatedCommit, nextCommit);
  assert.equal(result.nextSource.listingUpdatedBranch, "main");
  assert.equal(result.nextSource.listingUpdatedAt, updateAt);
  assert.equal(result.nextSource.listingUpdatedBy, "yamz8");
  assert.equal(result.nextSource.testedOmarchyVersion, "4.0.1");
  assert.equal(result.nextSource.license, "Apache-2.0");
  assert.deepEqual(result.nextSource.listingUpdateHistory, [{
    repository: targetRepo,
    commit: currentCommit,
    branch: "main",
    checkedAt: currentCheckedAt,
    supersededAt: updateAt,
  }]);
  assert.deepEqual(result.report, {
    schemaVersion: 1,
    themeId: "canyon",
    repository: targetRepo,
    previousCommit: currentCommit,
    updatedCommit: nextCommit,
    updatedBranch: "main",
    updatedAt: updateAt,
    updatedBy: "yamz8",
    testedOmarchyVersion: "4.0.1",
    ignoredFiles: ["setup.lua"],
    warnings: ["Omarchy filters setup.lua."],
    commitSubject: "Update canyon theme",
  });
});

test("theme updates append valid history without mutating its existing entries", () => {
  const value = fixture();
  const earlier = {
    repository: targetRepo,
    commit: "d".repeat(40),
    branch: "main",
    checkedAt: "2026-08-30T09:00:00.000Z",
    supersededAt: "2026-08-30T10:00:00.000Z",
  };
  value.targetSource.listingUpdateHistory = [earlier];
  const result = planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, options());
  assert.strictEqual(result.nextSource.listingUpdateHistory[0], earlier);
  assert.equal(result.nextSource.listingUpdateHistory.length, 2);
});

test("theme updates fail closed on missing identity, mismatches, current commits, and bad provenance", () => {
  const value = fixture();
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "missing", value.validation, options()),
    /not one unambiguous active source/,
  );
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", {
      ...value.validation,
      repository: retainedRepo,
    }, options()),
    /does not match the active source identity/,
  );
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", {
      ...value.validation,
      commit: currentCommit,
    }, options()),
    /already the current catalog snapshot/,
  );
  assert.throws(
    () => planThemeUpdate(value.registry, {
      ...value.catalog,
      themes: value.catalog.themes.map((theme) => theme.id === "canyon"
        ? { ...theme, checkedCommit: "short" }
        : theme),
    }, "canyon", value.validation, options()),
    /cannot be archived/,
  );
  value.targetSource.listingUpdateHistory = "invalid";
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, options()),
    /must be an array/,
  );
});

test("theme updates require a new timestamp, authorized actor, and tested Omarchy version", () => {
  const value = fixture();
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, {
      ...options(),
      updatedAt: value.catalog.generatedAt,
    }),
    /must be newer/,
  );
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, {
      ...options(),
      updatedBy: "invalid actor",
    }),
    /actor is missing or invalid/,
  );
  assert.throws(
    () => planThemeUpdate(value.registry, value.catalog, "canyon", value.validation, {
      ...options(),
      testedOmarchyVersion: "",
    }),
    /version is missing or invalid/,
  );
});

test("the update writer validates the requested exact commit and writes only registry evidence and its report", async () => {
  const value = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "theme-update-"));
  const registryPath = path.join(directory, "registry.json");
  const catalogPath = path.join(directory, "catalog.json");
  const reportPath = path.join(directory, "report.json");
  try {
    const catalogText = `${JSON.stringify(value.catalog, null, 2)}\n`;
    await writeFile(registryPath, `${JSON.stringify(value.registry, null, 2)}\n`);
    await writeFile(catalogPath, catalogText);
    const result = await updateThemeSource({
      registryPath,
      catalogPath,
      reportPath,
      themeId: "canyon",
      expectedCommit: nextCommit,
      ...options(),
    }, {
      validateSource: async (source, validationOptions) => {
        assert.deepEqual(source, value.targetSource);
        assert.equal(validationOptions.expectedCommit, nextCommit);
        return value.validation;
      },
    });
    const writtenRegistry = JSON.parse(await readFile(registryPath, "utf8"));
    assert.equal(writtenRegistry.sources[0].listingUpdatedCommit, nextCommit);
    assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), result.report);
    assert.equal(await readFile(catalogPath, "utf8"), catalogText);

    await assert.rejects(
      updateThemeSource({
        registryPath,
        catalogPath,
        reportPath: path.join(directory, "mismatch-report.json"),
        themeId: "canyon",
        expectedCommit: "e".repeat(40),
        ...options(),
      }, { validateSource: async () => value.validation }),
      /does not match the requested exact snapshot/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
