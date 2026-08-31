import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/update-theme.yml", import.meta.url), "utf8");

function jobSource(name, nextName = "") {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `${name} job must exist`);
  const end = nextName ? workflow.indexOf(`\n  ${nextName}:\n`, start + 1) : -1;
  return end > start ? workflow.slice(start, end) : workflow.slice(start);
}

test("theme updates are manual, exact-SHA, confirmed, and personal-maintainer-only", () => {
  const trigger = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\npermissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /schedule:|push:|pull_request|issues:/);
  for (const input of ["theme_id", "commit_sha", "tested_omarchy_version", "confirm_update"]) {
    assert.match(trigger, new RegExp(`${input}:[\\s\\S]*required: true`));
  }
  assert.match(workflow, /\^\[0-9a-fA-F\]\{40\}\$/);
  assert.equal((workflow.match(/test "\$ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$TRIGGERING_ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$REPOSITORY" = yamz8\/omarchy-theme-marketplace/g) || []).length, 2);
  assert.match(workflow, /theme-catalog-writes/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /inputs\.confirm_update == true/);
});

test("the read-only update build validates and builds only the exact requested source", () => {
  const prepare = jobSource("prepare", "verify");
  assert.match(prepare, /permissions:\n      contents: read/);
  assert.match(prepare, /node scripts\/update-theme-source\.mjs/);
  assert.match(prepare, /EXPECTED_THEME_COMMIT: \$\{\{ steps\.update\.outputs\.commit \}\}/);
  assert.match(prepare, /EXPECTED_THEME_REPOSITORY: \$\{\{ steps\.update\.outputs\.repository \}\}/);
  assert.match(prepare, /npm run build[\s\S]*npm test/);
  assert.match(prepare, /theme-update-report\.json[\s\S]*SHA256SUMS[\s\S]*upload-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(prepare, /contents: write|push origin/);
});

test("a read-only verifier checks projection semantics, unrelated previews, and Explorer output", () => {
  const verify = jobSource("verify", "publish");
  assert.match(verify, /permissions:\n      actions: read\n      contents: read/);
  assert.match(verify, /unexpected symbolic link[\s\S]*actual_files[\s\S]*expected_files/);
  assert.match(verify, /node scripts\/verify-theme-update\.mjs/);
  assert.match(verify, /node scripts\/build-explorer-data\.mjs[\s\S]*cmp -s site\/explorer-data\.json/);
  assert.doesNotMatch(verify, /contents: write|push origin|git commit/);
});

test("the update write-token job applies only verified files and performs one guarded push", () => {
  const publish = jobSource("publish");
  assert.match(publish, /needs: \[prepare, verify\]/);
  assert.match(publish, /permissions:\n      actions: read\n      contents: write/);
  assert.match(publish, /sha256sum --check SHA256SUMS/);
  assert.match(publish, /Reauthorize update before publication/);
  assert.match(publish, /git add registry\.json site\/catalog\.json site\/explorer-data\.json site\/assets\/img\/themes\//);
  assert.match(publish, /refusing to publish stale artifacts/);
  assert.equal((publish.match(/push origin HEAD:main/g) || []).length, 1);
  assert.doesNotMatch(publish, /node |npm |scripts\//);
});

test("every third-party update action is pinned to a full commit", () => {
  const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(actionReferences.length > 0);
  assert.ok(actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference)));
});
