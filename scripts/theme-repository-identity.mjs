import { githubRepositoryKey, parseGitHubRepository } from "./github-repository.mjs";
import { themeSlugFromRepository } from "./theme-domain.mjs";

const fullCommitPattern = /^[0-9a-f]{40}$/i;
const nodeIdPattern = /^R_[A-Za-z0-9_-]{1,126}$/;

function exactKeys(value, expected) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function canonicalSlug(value) {
  if (typeof value !== "string" || value !== value.trim()) return "";
  try {
    return parseGitHubRepository(`https://github.com/${value}`).slug;
  } catch {
    return "";
  }
}

function strictIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  return new Date(value).toISOString() === value ? value : "";
}

export function parseThemeRepositoryIdentity(value) {
  if (value === undefined) return null;
  if (!exactKeys(value, ["schemaVersion", "nodeId", "databaseId", "previousRepositories"])) {
    throw new Error("Theme repository identity has invalid fields");
  }
  if (value.schemaVersion !== 1
    || typeof value.nodeId !== "string"
    || !nodeIdPattern.test(value.nodeId)
    || !Number.isSafeInteger(value.databaseId)
    || value.databaseId < 1
    || !Array.isArray(value.previousRepositories)
    || value.previousRepositories.some((repository) => !canonicalSlug(repository))
    || new Set(value.previousRepositories.map((repository) => repository.toLowerCase())).size !== value.previousRepositories.length) {
    throw new Error("Theme repository identity is invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    nodeId: value.nodeId,
    databaseId: value.databaseId,
    previousRepositories: Object.freeze([...value.previousRepositories]),
  });
}

export function parseThemeRepositoryMigration(value) {
  const fields = [
    "schemaVersion",
    "themeId",
    "fromRepository",
    "toRepository",
    "nodeId",
    "databaseId",
    "previousCatalogCommit",
    "observedHeadCommit",
    "observedBranch",
    "observedAt",
  ];
  if (!exactKeys(value, fields)) throw new Error("Theme repository migration has invalid fields");
  const fromRepository = canonicalSlug(value.fromRepository);
  const toRepository = canonicalSlug(value.toRepository);
  if (value.schemaVersion !== 1
    || typeof value.themeId !== "string"
    || themeSlugFromRepository(`https://github.com/${fromRepository}`) !== value.themeId
    || themeSlugFromRepository(`https://github.com/${toRepository}`) !== value.themeId
    || !fromRepository
    || !toRepository
    || fromRepository.toLowerCase() === toRepository.toLowerCase()
    || typeof value.nodeId !== "string"
    || !nodeIdPattern.test(value.nodeId)
    || !Number.isSafeInteger(value.databaseId)
    || value.databaseId < 1
    || !fullCommitPattern.test(value.previousCatalogCommit || "")
    || !fullCommitPattern.test(value.observedHeadCommit || "")
    || typeof value.observedBranch !== "string"
    || !value.observedBranch
    || value.observedBranch.length > 255
    || /[\u0000-\u001f\u007f]/u.test(value.observedBranch)
    || !strictIsoTimestamp(value.observedAt)) {
    throw new Error("Theme repository migration is invalid");
  }
  return Object.freeze({
    ...value,
    fromRepository,
    toRepository,
  });
}

export function validateThemeRepositoryMigrations(registry) {
  if (!Array.isArray(registry?.repositoryMigrations)) {
    throw new Error("Registry repositoryMigrations must be an array");
  }
  const migrations = registry.repositoryMigrations.map(parseThemeRepositoryMigration);
  const sourceByRepository = new Map();
  for (const source of registry.sources || []) {
    const key = githubRepositoryKey(source.repo);
    if (sourceByRepository.has(key)) throw new Error("Registry contains duplicate repository sources");
    sourceByRepository.set(key, source);
    parseThemeRepositoryIdentity(source.repositoryIdentity);
  }

  const databaseByNode = new Map();
  const nodeByDatabase = new Map();
  const identityByRepository = new Map();
  const groups = new Map();
  migrations.forEach((migration, index) => {
    if ((databaseByNode.has(migration.nodeId) && databaseByNode.get(migration.nodeId) !== migration.databaseId)
      || (nodeByDatabase.has(migration.databaseId) && nodeByDatabase.get(migration.databaseId) !== migration.nodeId)) {
      throw new Error("Theme repository immutable IDs are not globally bijective");
    }
    databaseByNode.set(migration.nodeId, migration.databaseId);
    nodeByDatabase.set(migration.databaseId, migration.nodeId);
    const identityKey = `${migration.nodeId}:${migration.databaseId}`;
    for (const repository of [migration.fromRepository, migration.toRepository]) {
      const key = repository.toLowerCase();
      if (identityByRepository.has(key) && identityByRepository.get(key) !== identityKey) {
        throw new Error("Theme repository names cross immutable identities");
      }
      identityByRepository.set(key, identityKey);
    }
    const group = groups.get(identityKey) || [];
    group.push({ migration, index });
    groups.set(identityKey, group);
  });

  const coveredActiveRepositories = new Set();
  for (const group of groups.values()) {
    const from = new Map();
    const to = new Map();
    for (const entry of group) {
      const fromKey = entry.migration.fromRepository.toLowerCase();
      const toKey = entry.migration.toRepository.toLowerCase();
      if (from.has(fromKey) || to.has(toKey)) {
        throw new Error("Theme repository migration history branches or converges");
      }
      from.set(fromKey, entry);
      to.set(toKey, entry);
    }
    const roots = [...from.keys()].filter((repository) => !to.has(repository));
    const tails = [...to.keys()].filter((repository) => !from.has(repository));
    if (roots.length !== 1 || tails.length !== 1) {
      throw new Error("Theme repository migration history contains a cycle");
    }
    const chain = [];
    let repository = roots[0];
    while (from.has(repository)) {
      const entry = from.get(repository);
      chain.push(entry);
      repository = entry.migration.toRepository.toLowerCase();
      if (chain.length > group.length) throw new Error("Theme repository migration history contains a cycle");
    }
    if (repository !== tails[0]
      || chain.length !== group.length
      || chain.some((entry, index) => index > 0 && entry.index <= chain[index - 1].index)
      || chain.some((entry, index) => index > 0
        && Date.parse(entry.migration.observedAt) < Date.parse(chain[index - 1].migration.observedAt))) {
      throw new Error("Theme repository migration history is not one append-only chain");
    }

    const source = sourceByRepository.get(tails[0]);
    const identity = parseThemeRepositoryIdentity(source?.repositoryIdentity);
    const first = chain[0].migration;
    const expectedPrevious = chain.map((entry) => entry.migration.fromRepository.toLowerCase());
    const actualPrevious = (identity?.previousRepositories || []).map((entry) => entry.toLowerCase());
    if (!source
      || !identity
      || identity.nodeId !== first.nodeId
      || identity.databaseId !== first.databaseId
      || JSON.stringify(expectedPrevious) !== JSON.stringify(actualPrevious)
      || chain.some((entry) => entry.migration.themeId !== first.themeId
        || entry.migration.nodeId !== first.nodeId
        || entry.migration.databaseId !== first.databaseId)
      || themeSlugFromRepository(source.repo) !== first.themeId) {
      throw new Error("Theme repository migration does not match its active source identity");
    }
    for (const previous of expectedPrevious) {
      if (sourceByRepository.has(previous)) throw new Error("A migrated repository remains an active source");
    }
    coveredActiveRepositories.add(tails[0]);
  }

  for (const source of registry.sources || []) {
    const identity = parseThemeRepositoryIdentity(source.repositoryIdentity);
    if (identity && !coveredActiveRepositories.has(githubRepositoryKey(source.repo))) {
      throw new Error("Theme repository identity lacks global migration evidence");
    }
  }
  return Object.freeze(migrations);
}

export function assertObservedThemeRepositoryIdentity(source, observed) {
  const identity = parseThemeRepositoryIdentity(source?.repositoryIdentity);
  if (!identity) return;
  if (!observed
    || observed.nodeId !== identity.nodeId
    || observed.databaseId !== identity.databaseId
    || githubRepositoryKey(`https://github.com/${observed.nameWithOwner}`) !== githubRepositoryKey(source.repo)) {
    throw new Error(`Immutable repository identity mismatch for ${source.repo}`);
  }
}

async function githubGraphql(query, variables) {
  const headers = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "omarchy-theme-marketplace",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL returned ${response.status}`);
  return response.json();
}

export async function resolveThemeRepositoryMigrationIdentity(fromUrl, toUrl, requestGraphql = githubGraphql) {
  const from = parseGitHubRepository(fromUrl);
  const to = parseGitHubRepository(toUrl);
  const query = `query ThemeRepositoryMigration($fromOwner:String!,$fromName:String!,$toOwner:String!,$toName:String!){from:repository(owner:$fromOwner,name:$fromName){...Identity} to:repository(owner:$toOwner,name:$toName){...Identity} rateLimit{cost limit remaining resetAt}} fragment Identity on Repository{id databaseId nameWithOwner isArchived isDisabled isPrivate defaultBranchRef{name target{... on Commit{oid}}}}`;
  const payload = await requestGraphql(query, {
    fromOwner: from.owner,
    fromName: from.repository,
    toOwner: to.owner,
    toName: to.repository,
  });
  if (!payload || typeof payload !== "object" || !payload.data || (payload.errors && payload.errors.length)) {
    throw new Error("GitHub GraphQL returned ambiguous repository migration identity data");
  }
  const oldIdentity = payload.data.from;
  const newIdentity = payload.data.to;
  const rate = payload.data.rateLimit;
  for (const identity of [oldIdentity, newIdentity]) {
    if (!identity
      || typeof identity.id !== "string"
      || !nodeIdPattern.test(identity.id)
      || !Number.isSafeInteger(identity.databaseId)
      || identity.databaseId < 1
      || typeof identity.nameWithOwner !== "string"
      || identity.isPrivate
      || identity.isArchived
      || identity.isDisabled
      || typeof identity.defaultBranchRef?.name !== "string"
      || !fullCommitPattern.test(identity.defaultBranchRef?.target?.oid || "")) {
      throw new Error("GitHub GraphQL returned invalid repository migration identity fields");
    }
  }
  if (!Number.isSafeInteger(rate?.cost)
    || rate.cost < 1
    || !Number.isSafeInteger(rate?.limit)
    || rate.limit < 1
    || !Number.isSafeInteger(rate?.remaining)
    || rate.remaining > rate.limit
    || rate.remaining < 10
    || !Number.isFinite(Date.parse(rate?.resetAt || ""))) {
    throw new Error("GitHub GraphQL migration identity budget is invalid or insufficient");
  }
  if (oldIdentity.id !== newIdentity.id
    || oldIdentity.databaseId !== newIdentity.databaseId
    || oldIdentity.nameWithOwner.toLowerCase() !== newIdentity.nameWithOwner.toLowerCase()
    || newIdentity.nameWithOwner.toLowerCase() !== to.slug.toLowerCase()) {
    throw new Error("Old and new repository paths do not bind the same immutable GitHub repository");
  }
  return Object.freeze({
    fromRepository: from.slug,
    toRepository: to.slug,
    nodeId: newIdentity.id,
    databaseId: newIdentity.databaseId,
    observedHeadCommit: newIdentity.defaultBranchRef.target.oid.toLowerCase(),
    observedBranch: newIdentity.defaultBranchRef.name,
    observedAt: new Date().toISOString(),
  });
}
