import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const marker = "<!-- theme-submission-validation -->";

function escapeMarkdown(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("`", "\\`");
}

export function formatThemeValidationComment(result) {
  if (!result.ok) {
    return `${marker}\n## Theme validation needs changes\n\n${escapeMarkdown(result.error?.message || "Theme validation failed.")}\n\nEdit this issue after correcting the repository or submission fields. Validation will run again.\n\n> This compatibility check is not a security review or endorsement.`;
  }
  const { submission, source } = result;
  const repositoryName = new URL(source.repository).pathname.replace(/^\//, "");
  const commitUrl = `${source.repository}/commit/${source.commit}`;
  const warnings = source.warnings.length
    ? `\n\n### Notes\n\n${source.warnings.map((warning) => `- ${escapeMarkdown(warning)}`).join("\n")}`
    : "";
  return `${marker}\n## Theme validation passed\n\n| Field | Result |\n| --- | --- |\n| Theme | ${escapeMarkdown(submission.name)} |\n| Theme ID | \`${escapeMarkdown(source.themeId)}\` |\n| Repository | [${escapeMarkdown(repositoryName)}](${source.repository}) |\n| Exact snapshot | [\`${source.commit.slice(0, 12)}\`](${commitUrl}) |\n| Mode | ${escapeMarkdown(source.mode)} |\n| Wallpapers | ${source.backgroundCount} |\n| Preview | ${source.preview.width} × ${source.preview.height} ${escapeMarkdown(source.preview.format)} |\n| License | ${escapeMarkdown(source.license)} |${warnings}\n\nAn authorized maintainer may apply \`approved-theme\`. Approval performs a fresh inspection and requires the publication build to resolve that same commit.\n\n> Compatibility passed is not a security review, rights review, or endorsement. The normal install command obtains current mutable upstream.`;
}

async function githubApi(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "omarchy-theme-marketplace-validation",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = new Error(`GitHub API request failed (${response.status}) for ${path}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function removeLabel(owner, repository, issueNumber, label) {
  try {
    await githubApi(`/repos/${owner}/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

export async function publishThemeValidationFeedback(result) {
  const [owner, repository] = String(process.env.GITHUB_REPOSITORY || "").split("/");
  const issueNumber = Number(process.env.ISSUE_NUMBER);
  if (!owner || !repository || !Number.isInteger(issueNumber) || issueNumber < 1 || !process.env.GITHUB_TOKEN) {
    throw new Error("GitHub feedback environment is incomplete.");
  }
  const comments = await githubApi(`/repos/${owner}/${repository}/issues/${issueNumber}/comments?per_page=100`);
  const current = comments.find((comment) => String(comment.body || "").includes(marker));
  const body = formatThemeValidationComment(result);
  if (current) {
    await githubApi(`/repos/${owner}/${repository}/issues/comments/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  } else {
    await githubApi(`/repos/${owner}/${repository}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
  const wanted = result.ok ? "theme-validated" : "theme-needs-fixes";
  const unwanted = result.ok ? "theme-needs-fixes" : "theme-validated";
  await removeLabel(owner, repository, issueNumber, unwanted);
  await githubApi(`/repos/${owner}/${repository}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [wanted] }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = JSON.parse(await readFile(process.argv[2], "utf8"));
  await publishThemeValidationFeedback(result);
}
