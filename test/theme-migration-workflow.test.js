import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/migrate-theme-repository.yml", import.meta.url), "utf8");

function jobSource(name, nextName = "") {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `${name} job must exist`);
  const end = nextName ? workflow.indexOf(`\n  ${nextName}:\n`, start + 1) : -1;
  return end > start ? workflow.slice(start, end) : workflow.slice(start);
}

test("repository migration is manual, confirmed, main-bound, and personal-maintainer-only", () => {
  const trigger = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\npermissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /schedule:|push:|pull_request|issues:/);
  for (const input of ["theme_id", "new_repository", "confirm_migration"]) {
    assert.match(trigger, new RegExp(`${input}:[\\s\\S]*required: true`));
  }
  assert.equal((workflow.match(/test "\$ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$TRIGGERING_ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$REPOSITORY" = yamz8\/omarchy-theme-marketplace/g) || []).length, 2);
  assert.match(workflow, /theme-catalog-writes/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /inputs\.confirm_migration == true/);
});

test("the read-only migration build captures identity and refreshes only the canonical target", () => {
  const prepare = jobSource("prepare", "verify");
  assert.match(prepare, /permissions:\n      contents: read/);
  assert.match(prepare, /node scripts\/migrate-theme-repository\.mjs/);
  assert.match(prepare, /EXPECTED_THEME_COMMIT: \$\{\{ steps\.migration\.outputs\.commit \}\}/);
  assert.match(prepare, /PREVIOUS_THEME_REPOSITORY: \$\{\{ steps\.migration\.outputs\.from_repository \}\}/);
  assert.match(prepare, /npm run build[\s\S]*npm test/);
  assert.match(prepare, /theme-migration-report\.json[\s\S]*SHA256SUMS[\s\S]*upload-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(prepare, /contents: write|push origin/);
});

test("a read-only verifier checks migration semantics, unrelated bytes, and Explorer output", () => {
  const verify = jobSource("verify", "publish");
  assert.match(verify, /permissions:\n      actions: read\n      contents: read/);
  assert.match(verify, /unexpected symbolic link[\s\S]*actual_files[\s\S]*expected_files/);
  assert.match(verify, /node scripts\/verify-theme-migration\.mjs/);
  assert.match(verify, /node scripts\/build-explorer-data\.mjs[\s\S]*cmp -s site\/explorer-data\.json/);
  assert.doesNotMatch(verify, /contents: write|push origin|git commit/);
});

test("the migration write-token job applies only verified files and performs one guarded push", () => {
  const publish = jobSource("publish");
  assert.match(publish, /needs: \[prepare, verify\]/);
  assert.match(publish, /permissions:\n      actions: read\n      contents: write/);
  assert.match(publish, /sha256sum --check SHA256SUMS/);
  assert.match(publish, /Reauthorize migration before publication/);
  assert.match(publish, /git add registry\.json site\/catalog\.json site\/explorer-data\.json site\/assets\/img\/themes\//);
  assert.match(publish, /refusing to publish stale artifacts/);
  assert.equal((publish.match(/push origin HEAD:main/g) || []).length, 1);
  assert.doesNotMatch(publish, /node |npm |scripts\//);
});

test("every third-party migration action is pinned to a full commit", () => {
  const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(actionReferences.length > 0);
  assert.ok(actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference)));
});
