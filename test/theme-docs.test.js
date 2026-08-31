import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const documentationPaths = [
  "README.md",
  "SECURITY.md",
  "VERIFICATION.md",
  "SUBMISSION.md",
  "PLAN.md",
  "AGENTS.md",
  "NOTICE.md",
  "site/develop.html",
  "site/publish.html",
];

test("project documentation uses the native Omarchy theme contract", async () => {
  const documents = await Promise.all(documentationPaths.map(read));
  const combined = documents.join("\n");
  assert.match(combined, /omarchy theme install/);
  assert.match(combined, /omarchy theme set/);
  assert.match(combined, /colors\.toml/);
  assert.match(combined, /backgrounds\//);
  assert.match(combined, /current mutable upstream/i);
  assert.doesNotMatch(combined, /omarchyplugins\.com/);
  assert.doesNotMatch(combined, /omacom\/omarchy-plugin-marketplace/);
  assert.doesNotMatch(combined, /omarchy plugin (?:add|update)/);
  assert.doesNotMatch(combined, /manifest\.json/);
  assert.doesNotMatch(combined, /\[Plugin\]/);
  assert.doesNotMatch(combined, /submit-plugin|verify-plugin/);
});

test("submission guidance identifies its current manual boundary", async () => {
  const [submission, publish] = await Promise.all([read("SUBMISSION.md"), read("site/publish.html")]);
  assert.match(submission, /structured GitHub submission workflow is not implemented yet/i);
  assert.match(submission, /\[Theme\]: Theme name/);
  assert.match(submission, /I own or have permission to submit the theme and its assets/);
  assert.match(publish, /Structured theme submission automation is the next implementation phase/);
  assert.match(publish, /Open a theme proposal/);
});

test("snapshot documentation does not overstate compatibility inspection", async () => {
  const [security, verification] = await Promise.all([read("SECURITY.md"), read("VERIFICATION.md")]);
  assert.match(security, /not a security audit, certification, endorsement, warranty, or guarantee/i);
  assert.match(verification, /does not currently publish a `Verified` security status/);
  assert.match(verification, /checkedCommit/);
  assert.match(verification, /checkedBranch/);
  assert.match(verification, /checkedAt/);
});
