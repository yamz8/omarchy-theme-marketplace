import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { addApprovedThemeSource } from "../scripts/approve-theme-submission.mjs";
import { builtInThemeDirectories, entriesBelow } from "../scripts/theme-github-source.mjs";
import { validateCommunityThemeSource } from "../scripts/theme-source-validation.mjs";
import { formatThemeValidationComment } from "../scripts/theme-submission-feedback.mjs";
import {
  parseThemeSubmission,
  submissionChecklist,
  ThemeSubmissionError,
} from "../scripts/theme-submission.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function issueBody({ checked = true, tags = "dark, warm" } = {}) {
  return `### Repository URL

https://github.com/example/omarchy-canyon-theme

### Theme name

Canyon

### Author

Example Author

### Description

A warm dark theme with sandstone surfaces and a clear desert-sky accent.

### Tags

${tags}

### Tested Omarchy version

4.0.1

### Submission checklist

${submissionChecklist.map((item, index) => `- [${checked || index ? "x" : " "}] ${item}`).join("\n")}`;
}

test("theme submission parsing produces the native repository identity", () => {
  const submission = parseThemeSubmission({ title: "[Theme]: Canyon", body: issueBody() });
  assert.equal(submission.repo, "https://github.com/example/omarchy-canyon-theme");
  assert.equal(submission.id, "canyon");
  assert.equal(submission.name, "Canyon");
  assert.deepEqual(submission.tags, ["dark", "warm"]);
});

test("theme submissions reject incomplete rights and install confirmation", () => {
  assert.throws(
    () => parseThemeSubmission({ title: "[Theme]: Canyon", body: issueBody({ checked: false }) }),
    (error) => error instanceof ThemeSubmissionError && error.code === "submission-checklist-incomplete",
  );
  assert.throws(
    () => parseThemeSubmission({ title: "[Theme]: Canyon", body: issueBody({ tags: "Dark mode" }) }),
    (error) => error instanceof ThemeSubmissionError && error.code === "submission-tags-invalid",
  );
  assert.throws(
    () => parseThemeSubmission({
      title: "[Theme]: Canyon",
      body: issueBody().replace("### Author", "### Extra\n\nUnexpected\n\n### Author"),
    }),
    (error) => error instanceof ThemeSubmissionError && error.code === "submission-headings-invalid",
  );
});

test("source validation accepts a complete native theme and rejects a missing license", async () => {
  const submission = parseThemeSubmission({ title: "[Theme]: Canyon", body: issueBody() });
  const preview = await readFile(new URL("../site/assets/img/omarchy-wordmark.png", import.meta.url));
  const baseSnapshot = {
    repository: { owner: "example", repository: "omarchy-canyon-theme", slug: "example/omarchy-canyon-theme" },
    branch: "main",
    commit: "c".repeat(40),
    checkedAt: "2026-08-31T10:00:00Z",
    stars: 3,
    updatedAt: "2026-08-31T09:00:00Z",
    license: "MIT",
    entries: [
      { path: "colors.toml", type: "blob", mode: "100644", size: 400 },
      { path: "preview.png", type: "blob", mode: "100644", size: preview.length },
      { path: "backgrounds/canyon.png", type: "blob", mode: "100644", size: preview.length },
      { path: "README.md", type: "blob", mode: "100644", size: 100 },
      { path: "LICENSE", type: "blob", mode: "100644", size: 100 },
    ],
  };
  const colorsToml = `mode = "dark"
accent = "#7aa2f7"
background = "#1a1b26"
foreground = "#a9b1d6"
red = "#f7768e"
yellow = "#e0af68"
green = "#9ece6a"
cyan = "#449dab"
blue = "#7aa2f7"
magenta = "#ad8ee6"`;
  const dependencies = {
    resolveSnapshot: async () => baseSnapshot,
    fetchText: async () => colorsToml,
    fetchBuffer: async () => preview,
  };
  const validation = await validateCommunityThemeSource(submission, dependencies);
  assert.equal(validation.themeId, "canyon");
  assert.equal(validation.commit, "c".repeat(40));
  assert.equal(validation.mode, "dark");
  assert.equal(validation.backgroundCount, 1);
  assert.equal(validation.preview.format, "png");

  await assert.rejects(
    validateCommunityThemeSource(submission, {
      ...dependencies,
      resolveSnapshot: async () => ({
        ...baseSnapshot,
        entries: baseSnapshot.entries.filter((entry) => entry.path !== "LICENSE"),
      }),
    }),
    /root license file/,
  );
});

test("approval adds one audit-bound theme source and preserves retired IDs", () => {
  const registry = { schemaVersion: 1, retiredThemeIds: ["retired"], builtInSources: [{}], sources: [] };
  const catalog = { themes: [{ id: "tokyo-night" }] };
  const submission = parseThemeSubmission({ title: "[Theme]: Canyon", body: issueBody() });
  const source = addApprovedThemeSource(
    registry,
    catalog,
    submission,
    { commit: "a".repeat(40), license: "MIT" },
    {
      approvedAt: "2026-08-31T10:00:00Z",
      approvedBy: "maintainer",
      submissionIssue: "https://github.com/example/marketplace/issues/1",
    },
  );
  assert.equal(registry.sources.length, 1);
  assert.equal(source.repo, submission.repo);
  assert.equal(source.listingApprovedRepository, submission.repo);
  assert.equal(source.listingApprovedCommit, "a".repeat(40));
  assert.equal(source.listingApprovedBy, "maintainer");
  assert.equal(source.testedOmarchyVersion, "4.0.1");
  assert.deepEqual(registry.retiredThemeIds, ["retired"]);
  assert.throws(() => addApprovedThemeSource(registry, catalog, submission, {}, {
    approvedAt: "2026-08-31T10:00:00Z",
    approvedBy: "maintainer",
    submissionIssue: "https://github.com/example/marketplace/issues/1",
  }), /already listed/);
});

test("validation feedback exposes exact snapshot and mutable-install boundary", () => {
  const comment = formatThemeValidationComment({
    ok: true,
    submission: { name: "Canyon" },
    source: {
      repository: "https://github.com/example/omarchy-canyon-theme",
      themeId: "canyon",
      commit: "b".repeat(40),
      mode: "dark",
      backgroundCount: 3,
      preview: { width: 1920, height: 1080, format: "png" },
      license: "MIT",
      warnings: [],
    },
  });
  assert.match(comment, /Exact snapshot/);
  assert.match(comment, new RegExp("b{12}"));
  assert.match(comment, /approved-theme/);
  assert.match(comment, /current mutable upstream/);
  assert.match(comment, /not a security review/);
});

test("GitHub tree helpers preserve theme-relative source paths", () => {
  const entries = [
    { path: "themes/one/colors.toml", type: "blob" },
    { path: "themes/one/backgrounds/one.png", type: "blob" },
    { path: "themes/two/colors.toml", type: "blob" },
  ];
  assert.deepEqual(builtInThemeDirectories({ entries }, "themes"), ["one", "two"]);
  assert.deepEqual(entriesBelow(entries, "themes/one").map((entry) => entry.path), ["colors.toml", "backgrounds/one.png"]);
});

test("repository automation is theme-only, pinned, and least-privilege scoped", async () => {
  const [workflowNames, formNames] = await Promise.all([
    readdir(new URL(".github/workflows/", root)),
    readdir(new URL(".github/ISSUE_TEMPLATE/", root)),
  ]);
  assert.deepEqual(workflowNames.sort(), [
    "approve-theme-submission.yml",
    "delist-themes.yml",
    "deploy-pages.yml",
    "migrate-theme-repository.yml",
    "provision-labels.yml",
    "refresh-catalog.yml",
    "update-theme.yml",
    "validate-theme-submission.yml",
    "verify.yml",
  ]);
  assert.deepEqual(formNames.sort(), ["config.yml", "rights-request.yml", "submit-theme.yml"]);

  const workflows = await Promise.all(workflowNames.map((name) => read(`.github/workflows/${name}`)));
  const workflowSource = workflows.join("\n");
  assert.doesNotMatch(workflowSource, /plugin|Plugin|PLUGIN/);
  assert.doesNotMatch(workflowSource, /pull_request_target/);
  assert.doesNotMatch(workflowSource, /persist-credentials:\s*true/);
  for (const match of workflowSource.matchAll(/uses:\s*[^\s]+@([^\s]+)/g)) {
    assert.match(match[1], /^[0-9a-f]{40}$/, `Unpinned action: ${match[0]}`);
  }
  assert.match(workflowSource, /EXPECTED_THEME_COMMIT/);
  assert.match(workflowSource, /theme-catalog-writes/);
  assert.match(workflowSource, /contains\(github\.event\.issue\.labels\.\*\.name, 'theme-validated'\)/);
  assert.match(workflowSource, /permissions:\n\s+contents: write\n\s+issues: write/);

  const form = await read(".github/ISSUE_TEMPLATE/submit-theme.yml");
  for (const checklistItem of submissionChecklist) assert.ok(form.includes(checklistItem));
  assert.match(form, /title: "\[Theme\]: "/);
});
