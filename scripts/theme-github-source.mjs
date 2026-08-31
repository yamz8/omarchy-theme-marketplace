import { parseGitHubRepository } from "./github-repository.mjs";

const requestTimeoutMs = 30_000;

function requestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "omarchy-theme-marketplace",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchRequired(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response;
}

async function fetchGitHubJson(path) {
  const response = await fetchRequired(`https://api.github.com${path}`, {
    headers: requestHeaders(),
  });
  return response.json();
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

export async function resolveRepositorySnapshot(repoUrl, requestedReference = "", { expectedCommit = "" } = {}) {
  const repository = parseGitHubRepository(repoUrl);
  if (expectedCommit && !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error("Expected theme snapshot must be a full commit SHA.");
  }
  const repositoryPath = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;
  const metadata = await fetchGitHubJson(`/repos${repositoryPath}`);
  if (metadata.private || metadata.visibility === "private") {
    throw new Error(`Theme repository must be public: ${repository.slug}`);
  }
  if (String(metadata.full_name || "").toLowerCase() !== repository.slug.toLowerCase()) {
    throw new Error(`Use the canonical GitHub repository URL reported by GitHub: ${metadata.html_url || metadata.full_name}`);
  }
  const branch = requestedReference || metadata.default_branch;
  if (!branch) throw new Error(`Repository has no default branch: ${repository.slug}`);

  const reference = expectedCommit || branch;
  const commit = await fetchGitHubJson(`/repos${repositoryPath}/commits/${encodeURIComponent(reference)}`);
  const treeSha = commit?.commit?.tree?.sha;
  if (!commit?.sha || !treeSha) throw new Error(`Unable to resolve ${repository.slug}@${reference}`);
  if (expectedCommit && commit.sha.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(`Repository commit changed before publication: expected ${expectedCommit}, received ${commit.sha}`);
  }

  const tree = await fetchGitHubJson(`/repos${repositoryPath}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
  if (tree.truncated) throw new Error(`Repository tree is too large to inspect completely: ${repository.slug}`);

  return Object.freeze({
    repository,
    branch,
    commit: commit.sha,
    checkedAt: new Date().toISOString(),
    stars: Number(metadata.stargazers_count || 0),
    updatedAt: String(metadata.pushed_at || metadata.updated_at || ""),
    license: metadata.license?.spdx_id && metadata.license.spdx_id !== "NOASSERTION"
      ? metadata.license.spdx_id
      : "",
    entries: Object.freeze((tree.tree || []).map((entry) => ({
      path: String(entry.path || ""),
      type: String(entry.type || ""),
      mode: String(entry.mode || ""),
      size: Number(entry.size || 0),
    }))),
  });
}

function rawUrl(snapshot, path) {
  const { owner, repository } = snapshot.repository;
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(snapshot.commit)}/${encodePath(path)}`;
}

export async function fetchSnapshotText(snapshot, path, { maxBytes = 128 * 1024 } = {}) {
  const response = await fetchRequired(rawUrl(snapshot, path));
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error(`Theme text asset exceeds ${maxBytes} bytes: ${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`Theme text asset exceeds ${maxBytes} bytes: ${path}`);
  return buffer.toString("utf8");
}

export async function fetchSnapshotBuffer(snapshot, path, { maxBytes = 50 * 1024 * 1024 } = {}) {
  const response = await fetchRequired(rawUrl(snapshot, path));
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error(`Theme asset exceeds ${maxBytes} bytes: ${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`Theme asset exceeds ${maxBytes} bytes: ${path}`);
  return buffer;
}

export function entriesBelow(entries, directory) {
  const prefix = directory ? `${directory.replace(/\/$/, "")}/` : "";
  return entries
    .filter((entry) => entry.path.startsWith(prefix) && entry.path !== directory)
    .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
}

export function builtInThemeDirectories(snapshot, themeRoot) {
  const prefix = `${themeRoot.replace(/\/$/, "")}/`;
  return [...new Set(snapshot.entries
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix) && entry.path.endsWith("/colors.toml"))
    .map((entry) => entry.path.slice(prefix.length).split("/")[0]))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));
}

export function sourceAtCommit(snapshot, path = "") {
  const suffix = path ? `/${encodePath(path)}` : "";
  return `https://github.com/${snapshot.repository.owner}/${snapshot.repository.repository}/tree/${snapshot.commit}${suffix}`;
}
