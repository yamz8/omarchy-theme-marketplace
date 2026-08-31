import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { githubRepositoryKey } from "./github-repository.mjs";
import { parseThemeSubmission } from "./theme-submission.mjs";
import { validateCommunityThemeSource } from "./theme-source-validation.mjs";

const root = resolve(import.meta.dirname, "..");
const registryPath = resolve(root, "registry.json");
const catalogPath = resolve(root, "site/catalog.json");

export function addApprovedThemeSource(registry, catalog, submission, validation, approval) {
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.sources) || !Array.isArray(registry.retiredThemeIds)) {
    throw new Error("registry.json does not use the supported theme registry schema.");
  }
  const repositoryKey = githubRepositoryKey(submission.repo);
  if (registry.sources.some((source) => githubRepositoryKey(source.repo) === repositoryKey)) {
    throw new Error(`Theme repository is already listed: ${submission.repo}`);
  }
  const activeIds = new Set((catalog?.themes || []).map((theme) => theme.id));
  if (activeIds.has(submission.id)) throw new Error(`Theme ID is already active: ${submission.id}`);
  if (registry.retiredThemeIds.includes(submission.id)) throw new Error(`Theme ID is retired and cannot be reused: ${submission.id}`);
  if (!/^[0-9a-f]{40}$/i.test(validation.commit || "")) throw new Error("Approved theme snapshot must be a full commit SHA.");
  if (!/^[A-Za-z0-9-]+$/.test(approval.approvedBy || "")) throw new Error("Approval actor is missing or invalid.");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(approval.submissionIssue || "")) {
    throw new Error("Submission issue URL is missing or invalid.");
  }

  const approvedAt = new Date(approval.approvedAt).toISOString();
  const source = {
    repo: submission.repo,
    addedAt: approvedAt.slice(0, 10),
    name: submission.name,
    description: submission.description,
    author: submission.author,
    tags: [...submission.tags],
    license: validation.license,
    testedOmarchyVersion: submission.testedOmarchyVersion,
    listingApprovedCommit: validation.commit,
    listingApprovedAt: approvedAt,
    listingApprovedBy: approval.approvedBy,
    submissionIssue: approval.submissionIssue,
  };
  registry.sources.push(source);
  registry.sources.sort((first, second) => githubRepositoryKey(first.repo).localeCompare(githubRepositoryKey(second.repo)));
  return source;
}

export async function approveThemeSubmission(input, approval) {
  const submission = parseThemeSubmission(input);
  const validation = await validateCommunityThemeSource(submission);
  const [registry, catalog] = await Promise.all([
    readFile(registryPath, "utf8").then(JSON.parse),
    readFile(catalogPath, "utf8").then(JSON.parse),
  ]);
  const source = addApprovedThemeSource(registry, catalog, submission, validation, approval);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return { submission, validation, source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await approveThemeSubmission(
      { title: process.env.ISSUE_TITLE, body: process.env.ISSUE_BODY },
      {
        approvedAt: process.env.APPROVED_AT,
        approvedBy: process.env.APPROVED_BY,
        submissionIssue: process.env.SUBMISSION_ISSUE,
      },
    );
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, [
        `repository=${result.validation.repository}`,
        `commit=${result.validation.commit}`,
        `theme_id=${result.validation.themeId}`,
      ].join("\n") + "\n");
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}
