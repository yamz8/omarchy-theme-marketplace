import assert from "node:assert/strict";
import test from "node:test";
import {
  assertObservedThemeRepositoryIdentity,
  parseThemeRepositoryIdentity,
  resolveThemeRepositoryMigrationIdentity,
  validateThemeRepositoryMigrations,
} from "../scripts/theme-repository-identity.mjs";

const oldRepository = "Example/omarchy-canyon-theme";
const newRepository = "Example/canyon-theme";
const oldUrl = `https://github.com/${oldRepository}`;
const newUrl = `https://github.com/${newRepository}`;
const nodeId = "R_kgDOCanyon";
const databaseId = 123456;

function migration(overrides = {}) {
  return {
    schemaVersion: 1,
    themeId: "canyon",
    fromRepository: oldRepository,
    toRepository: newRepository,
    nodeId,
    databaseId,
    previousCatalogCommit: "a".repeat(40),
    observedHeadCommit: "b".repeat(40),
    observedBranch: "main",
    observedAt: "2026-08-31T11:00:00.000Z",
    ...overrides,
  };
}

function migratedSource(overrides = {}) {
  return {
    repo: newUrl,
    repositoryIdentity: {
      schemaVersion: 1,
      nodeId,
      databaseId,
      previousRepositories: [oldRepository],
    },
    ...overrides,
  };
}

test("simultaneous old and canonical GraphQL paths must bind one immutable identity", async () => {
  let request;
  const observation = await resolveThemeRepositoryMigrationIdentity(oldUrl, newUrl, async (query, variables) => {
    request = { query, variables };
    const identity = {
      id: nodeId,
      databaseId,
      nameWithOwner: newRepository,
      isArchived: false,
      isDisabled: false,
      isPrivate: false,
      defaultBranchRef: { name: "main", target: { oid: "b".repeat(40) } },
    };
    return {
      data: {
        from: identity,
        to: identity,
        rateLimit: { cost: 1, limit: 5000, remaining: 4999, resetAt: "2026-08-31T12:00:00Z" },
      },
    };
  });
  assert.match(request.query, /from:repository[\s\S]*to:repository/);
  assert.deepEqual(request.variables, {
    fromOwner: "Example",
    fromName: "omarchy-canyon-theme",
    toOwner: "Example",
    toName: "canyon-theme",
  });
  assert.equal(observation.nodeId, nodeId);
  assert.equal(observation.databaseId, databaseId);
  assert.equal(observation.observedHeadCommit, "b".repeat(40));
});

test("migration identity capture rejects path, node, database, state, and quota ambiguity", async () => {
  const base = {
    id: nodeId,
    databaseId,
    nameWithOwner: newRepository,
    isArchived: false,
    isDisabled: false,
    isPrivate: false,
    defaultBranchRef: { name: "main", target: { oid: "b".repeat(40) } },
  };
  const payload = (from, to, rate = { cost: 1, limit: 5000, remaining: 4999, resetAt: "2026-08-31T12:00:00Z" }) => ({
    data: { from, to, rateLimit: rate },
  });
  for (const response of [
    payload(base, { ...base, id: "R_kgDOOther" }),
    payload(base, { ...base, databaseId: 999 }),
    payload(base, { ...base, nameWithOwner: "Example/other-theme" }),
    payload(base, { ...base, isPrivate: true }),
    payload(base, base, { cost: 1, limit: 5000, remaining: 0, resetAt: "2026-08-31T12:00:00Z" }),
    { data: { from: base, to: base }, errors: [{ message: "ambiguous" }] },
  ]) {
    await assert.rejects(
      resolveThemeRepositoryMigrationIdentity(oldUrl, newUrl, async () => response),
      /immutable|invalid|ambiguous|budget/i,
    );
  }
});

test("registry migration evidence forms one append-only immutable identity chain", () => {
  const registry = {
    repositoryMigrations: [migration()],
    sources: [migratedSource()],
  };
  assert.equal(validateThemeRepositoryMigrations(registry).length, 1);
  assertObservedThemeRepositoryIdentity(registry.sources[0], {
    nodeId,
    databaseId,
    nameWithOwner: newRepository,
  });
  assert.throws(
    () => assertObservedThemeRepositoryIdentity(registry.sources[0], {
      nodeId: "R_kgDOOther",
      databaseId,
      nameWithOwner: newRepository,
    }),
    /Immutable repository identity mismatch/,
  );
});

test("registry migration evidence rejects missing, branched, cyclic, or crossed identities", () => {
  assert.throws(
    () => validateThemeRepositoryMigrations({ repositoryMigrations: [], sources: [migratedSource()] }),
    /lacks global migration evidence/,
  );
  assert.throws(
    () => validateThemeRepositoryMigrations({
      repositoryMigrations: [migration(), migration({ toRepository: "Other/canyon-theme" })],
      sources: [migratedSource({ repo: "https://github.com/Other/canyon-theme" })],
    }),
    /branches or converges/,
  );
  assert.throws(
    () => validateThemeRepositoryMigrations({
      repositoryMigrations: [
        migration(),
        migration({
          fromRepository: newRepository,
          toRepository: oldRepository,
          previousCatalogCommit: "b".repeat(40),
          observedAt: "2026-08-31T12:00:00.000Z",
        }),
      ],
      sources: [migratedSource({ repo: oldUrl })],
    }),
    /cycle/,
  );
  assert.throws(
    () => validateThemeRepositoryMigrations({
      repositoryMigrations: [
        migration(),
        migration({
          fromRepository: "Other/omarchy-canyon-theme",
          toRepository: "Other/canyon-theme",
          nodeId,
          databaseId: 999,
        }),
      ],
      sources: [
        migratedSource(),
        migratedSource({
          repo: "https://github.com/Other/canyon-theme",
          repositoryIdentity: {
            schemaVersion: 1,
            nodeId,
            databaseId: 999,
            previousRepositories: ["Other/omarchy-canyon-theme"],
          },
        }),
      ],
    }),
    /globally bijective/,
  );
  assert.throws(
    () => parseThemeRepositoryIdentity({
      schemaVersion: 1,
      nodeId,
      databaseId: String(databaseId),
      previousRepositories: [oldRepository],
    }),
    /identity is invalid/,
  );
});
