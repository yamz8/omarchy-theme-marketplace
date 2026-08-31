import { parseGitHubRepository } from "./github-repository.mjs";
import { themeSlugFromRepository } from "./theme-domain.mjs";

export const submissionHeadings = Object.freeze([
  "Repository URL",
  "Theme name",
  "Author",
  "Description",
  "Tags",
  "Tested Omarchy version",
  "Submission checklist",
]);

export const submissionChecklist = Object.freeze([
  "The repository is public and installs with `omarchy theme install`.",
  "I tested the published repository on current Omarchy.",
  "The repository includes a README and license.",
  "I own or have permission to submit the theme and its assets.",
  "I understand that catalog listing is not a security review or endorsement.",
]);

export class ThemeSubmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ThemeSubmissionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ThemeSubmissionError(code, message);
}

function sectionsFromIssueBody(body) {
  const text = String(body || "").replaceAll("\r\n", "\n");
  const matches = [...text.matchAll(/^###\s+([^\n]+)\s*$/gm)];
  const sections = new Map();
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    sections.set(match[1].trim(), text.slice(start, end).trim());
  });
  return {
    headings: matches.map((match) => match[1].trim()),
    sections,
  };
}

function requiredText(sections, heading, { min = 1, max = 200 } = {}) {
  const raw = String(sections.get(heading) || "").trim();
  const value = raw === "_No response_" ? "" : raw.replaceAll(/\s+/g, " ");
  if (value.length < min) fail("submission-field-missing", `${heading} is required.`);
  if (value.length > max) fail("submission-field-too-long", `${heading} must be ${max} characters or fewer.`);
  if (/[<>\u0000-\u001f]/.test(value)) fail("submission-field-invalid", `${heading} contains unsupported characters.`);
  return value;
}

function parseTags(value) {
  const tags = [...new Set(value.split(/[\n,]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (tags.length < 1 || tags.length > 3) fail("submission-tags-invalid", "Choose between one and three tags.");
  const invalid = tags.find((tag) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag) || tag.length > 24);
  if (invalid) fail("submission-tags-invalid", `Unsupported theme tag: ${invalid}`);
  return Object.freeze(tags);
}

function confirmChecklist(value) {
  const checked = [...String(value).matchAll(/^- \[[xX]\]\s+(.+)$/gm)].map((match) => match[1].trim());
  const missing = submissionChecklist.filter((item) => !checked.includes(item));
  if (missing.length) fail("submission-checklist-incomplete", `Complete every submission checklist item. Missing: ${missing[0]}`);
}

export function parseThemeSubmission({ title, body }) {
  const issueTitle = String(title || "").trim();
  if (!/^\[Theme\]:\s+\S/.test(issueTitle)) {
    fail("submission-title-invalid", "The issue title must start with `[Theme]:` followed by the theme name.");
  }

  const parsedBody = sectionsFromIssueBody(body);
  const headingsMatch = parsedBody.headings.length === submissionHeadings.length
    && parsedBody.headings.every((heading, index) => heading === submissionHeadings[index]);
  if (!headingsMatch) {
    fail("submission-headings-invalid", "Submission headings must remain complete and in their original order.");
  }
  const { sections } = parsedBody;

  const repoValue = requiredText(sections, "Repository URL", { max: 200 });
  const repository = parseGitHubRepository(repoValue);
  const repo = `https://github.com/${repository.owner}/${repository.repository}`;
  const name = requiredText(sections, "Theme name", { min: 2, max: 60 });
  const titleName = issueTitle.replace(/^\[Theme\]:\s*/, "").trim();
  if (titleName.toLowerCase() !== name.toLowerCase()) {
    fail("submission-title-mismatch", "The issue title theme name must match the Theme name field.");
  }
  const author = requiredText(sections, "Author", { min: 2, max: 80 });
  const description = requiredText(sections, "Description", { min: 20, max: 240 });
  const tags = parseTags(requiredText(sections, "Tags", { max: 100 }));
  const testedOmarchyVersion = requiredText(sections, "Tested Omarchy version", { max: 40 });
  confirmChecklist(sections.get("Submission checklist"));

  return Object.freeze({
    repo,
    id: themeSlugFromRepository(repo),
    name,
    author,
    description,
    tags,
    testedOmarchyVersion,
  });
}
