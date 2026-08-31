import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  migrateThemeRepository,
  planThemeRepositoryMigration,
} from "../scripts/migrate-theme-repository.mjs";

const oldRepo = "https://github.com/example/omarchy-canyon-theme";
const newRepo = "https://github.com/example/canyon-theme";
const previousCommit = "a".repeat(40);
const headCommit = "b".repeat(40);
const observedAt = "2026-08-31T11:00:00.000Z";

function fixture() {
  const source = {
    repo: oldRepo,
    name: "Canyon",
    listingApprovedCommit: "0".repeat(40),
    listingUpdatedCommit: previousCommit,
    listingUpdateHistory: [{
      repository: oldRepo,
      commit: "f".repeat(40),
      branch: "main",
      checkedAt: "2026-08-30T09:00:00.000Z",
      supersededAt: "2026-08-30T10:00:00.000Z",
    }],
  };
  const unrelatedSource = { repo: "https://github.com/example/omarchy-forest-theme", name: "Forest" };
  return {
    source,
    unrelatedSource,
    registry: {
      schemaVersion: 1,
      retiredThemeIds: [],
      repositoryMigrations: [],
      builtInSources: [],
      sources: [source, unrelatedSource],
    },
    catalog: {
      generatedAt: "2026-08-31T10:30:00.000Z",
      schemaVersion: 1,
      themes: [{
        id: "canyon",
        repo: oldRepo,
        sourceType: "community",
        checkedCommit: previousCommit,
        checkedBranch: "main",
        checkedAt: "2026-08-31T10:00:00.000Z",
      }],
    },
    observation: {
      fromRepository: "example/omarchy-canyon-theme",
      toRepository: "example/canyon-theme",
      nodeId: "R_kgDOCanyon",
      databaseId: 123456,
      observedHeadCommit: headCommit,
      observedBranch: "main",
      observedAt,
    },
    validation: {
      repository: newRepo,
      themeId: "canyon",
      commit: headCommit,
      branch: "main",
      ignoredFiles: [],
      warnings: [],
    },
  };
}

test("repository migration changes only active path and identity while preserving historical evidence", () => {
  const value = fixture();
  const result = planThemeRepositoryMigration(value.registry, value.catalog, {
    themeId: "canyon",
    newRepository: newRepo,
  }, value.observation, value.validation);

  assert.strictEqual(result.nextRegistry.sources[1], value.unrelatedSource);
  assert.equal(result.nextSource.repo, newRepo);
  assert.deepEqual(result.nextSource.repositoryIdentity, {
    schemaVersion: 1,
    nodeId: "R_kgDOCanyon",
    databaseId: 123456,
    previousRepositories: ["example/omarchy-canyon-theme"],
  });
  assert.equal(result.nextSource.listingApprovedRepository, oldRepo);
  assert.equal(result.nextSource.listingUpdatedRepository, oldRepo);
  assert.strictEqual(result.nextSource.listingUpdateHistory[0], value.source.listingUpdateHistory[0]);
  assert.equal(result.nextSource.listingUpdatedCommit, previousCommit);
  assert.equal(result.migration.previousCatalogCommit, previousCommit);
  assert.equal(result.migration.observedHeadCommit, headCommit);
  assert.equal(result.report.commitSubject, "Migrate canyon theme repository");
});

test("repository migration rejects changed IDs, active targets, mismatched immutable identity, and stale validation", () => {
  const value = fixture();
  assert.throws(
    () => planThemeRepositoryMigration(value.registry, value.catalog, {
      themeId: "canyon",
      newRepository: "https://github.com/example/omarchy-desert-theme",
    }, { ...value.observation, toRepository: "example/omarchy-desert-theme" }, {
      ...value.validation,
      repository: "https://github.com/example/omarchy-desert-theme",
      themeId: "desert",
    }),
    /preserve the installed Omarchy theme ID/,
  );
  assert.throws(
    () => planThemeRepositoryMigration({
      ...value.registry,
      sources: [...value.registry.sources, { repo: newRepo }],
    }, value.catalog, { themeId: "canyon", newRepository: newRepo }, value.observation, value.validation),
    /not one unambiguous active source|already an active source/,
  );
  value.source.repositoryIdentity = {
    schemaVersion: 1,
    nodeId: "R_kgDOOther",
    databaseId: 999,
    previousRepositories: [],
  };
  assert.throws(
    () => planThemeRepositoryMigration(value.registry, value.catalog, {
      themeId: "canyon",
      newRepository: newRepo,
    }, value.observation, value.validation),
    /lacks global migration evidence|conflicts with the stored/,
  );

  const fresh = fixture();
  assert.throws(
    () => planThemeRepositoryMigration(fresh.registry, fresh.catalog, {
      themeId: "canyon",
      newRepository: newRepo,
    }, fresh.observation, { ...fresh.validation, commit: "c".repeat(40) }),
    /does not match the observed canonical HEAD/,
  );
});

test("the migration writer captures old and new identity together, validates exact HEAD, and writes no catalog", async () => {
  const value = fixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "theme-migration-"));
  const registryPath = path.join(directory, "registry.json");
  const catalogPath = path.join(directory, "catalog.json");
  const reportPath = path.join(directory, "report.json");
  try {
    const catalogText = `${JSON.stringify(value.catalog, null, 2)}\n`;
    await writeFile(registryPath, `${JSON.stringify(value.registry, null, 2)}\n`);
    await writeFile(catalogPath, catalogText);
    const result = await migrateThemeRepository({
      registryPath,
      catalogPath,
      reportPath,
      themeId: "canyon",
      newRepository: newRepo,
    }, {
      resolveIdentity: async (from, to) => {
        assert.equal(from, oldRepo);
        assert.equal(to, newRepo);
        return value.observation;
      },
      validateSource: async (source, options) => {
        assert.equal(source.repo, newRepo);
        assert.equal(options.expectedCommit, headCommit);
        return value.validation;
      },
    });
    assert.equal(JSON.parse(await readFile(registryPath, "utf8")).sources[0].repo, newRepo);
    assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), result.report);
    assert.equal(await readFile(catalogPath, "utf8"), catalogText);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a second migration appends one identity chain without rebinding older update evidence", () => {
  const value = fixture();
  const first = planThemeRepositoryMigration(value.registry, value.catalog, {
    themeId: "canyon",
    newRepository: newRepo,
  }, value.observation, value.validation);
  const finalRepo = "https://github.com/another/canyon-theme";
  const secondCatalog = {
    ...value.catalog,
    generatedAt: "2026-08-31T11:30:00.000Z",
    themes: [{
      ...value.catalog.themes[0],
      repo: newRepo,
      checkedCommit: headCommit,
      checkedAt: "2026-08-31T11:01:00.000Z",
    }],
  };
  const secondObservation = {
    ...value.observation,
    fromRepository: "example/canyon-theme",
    toRepository: "another/canyon-theme",
    observedHeadCommit: "c".repeat(40),
    observedAt: "2026-08-31T12:00:00.000Z",
  };
  const secondValidation = {
    ...value.validation,
    repository: finalRepo,
    commit: secondObservation.observedHeadCommit,
  };
  const second = planThemeRepositoryMigration(first.nextRegistry, secondCatalog, {
    themeId: "canyon",
    newRepository: finalRepo,
  }, secondObservation, secondValidation);
  assert.equal(second.nextRegistry.repositoryMigrations.length, 2);
  assert.deepEqual(second.nextSource.repositoryIdentity.previousRepositories, [
    "example/omarchy-canyon-theme",
    "example/canyon-theme",
  ]);
  assert.equal(second.nextSource.listingUpdatedRepository, oldRepo);
  assert.equal(second.nextSource.listingUpdatedCommit, previousCommit);
});
