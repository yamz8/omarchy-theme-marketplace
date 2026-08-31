import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/delist-themes.yml", import.meta.url), "utf8");

function jobSource(name, nextName = "") {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `${name} job must exist`);
  const end = nextName ? workflow.indexOf(`\n  ${nextName}:\n`, start + 1) : -1;
  return end > start ? workflow.slice(start, end) : workflow.slice(start);
}

test("theme delisting is manual, main-bound, confirmed, and personal-maintainer-only", () => {
  const trigger = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\npermissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /schedule:|push:|pull_request|issues:/);
  assert.match(trigger, /theme_ids:[\s\S]*required: true[\s\S]*confirm_delisting:[\s\S]*type: boolean/);
  assert.equal((workflow.match(/github\.actor == 'yamz8'/g) || []).length, 1);
  assert.equal((workflow.match(/github\.triggering_actor == 'yamz8'/g) || []).length, 1);
  assert.equal((workflow.match(/github\.repository == 'yamz8\/omarchy-theme-marketplace'/g) || []).length, 1);
  assert.equal((workflow.match(/test "\$ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$TRIGGERING_ACTOR" = yamz8/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$REPOSITORY" = yamz8\/omarchy-theme-marketplace/g) || []).length, 2);
  assert.match(workflow, /theme-catalog-writes/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /inputs\.confirm_delisting == true/);
});

test("read-only jobs create, test, checksum, and replay one static delisting transaction", () => {
  const prepare = jobSource("prepare", "verify");
  assert.match(prepare, /permissions:\n      contents: read/);
  assert.match(prepare, /persist-credentials: false/);
  assert.match(prepare, /node scripts\/delist-themes\.mjs[\s\S]*npm run build:explorer[\s\S]*npm test/);
  assert.match(prepare, /git diff --exit-code -- \.[\s\S]*':!registry\.json'[\s\S]*':!site\/catalog\.json'[\s\S]*':!site\/explorer-data\.json'[\s\S]*':!site\/assets\/img\/themes\/'/);
  assert.match(prepare, /delisting-report\.json[\s\S]*SHA256SUMS[\s\S]*upload-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(prepare, /contents: write|push origin/);

  const verify = jobSource("verify", "publish");
  assert.match(verify, /permissions:\n      actions: read\n      contents: read/);
  assert.match(verify, /unexpected symbolic link[\s\S]*actual_files[\s\S]*expected_files/);
  assert.match(verify, /recomputed-delisting[\s\S]*node scripts\/delist-themes\.mjs/);
  assert.match(verify, /cmp -s site\/explorer-data\.json/);
  assert.doesNotMatch(verify, /contents: write|push origin|git commit/);
});

test("the write-token job applies only verified files and performs one guarded push", () => {
  const publish = jobSource("publish", "deploy");
  assert.match(publish, /needs: \[prepare, verify\]/);
  assert.match(publish, /permissions:\n      actions: read\n      contents: write/);
  assert.match(publish, /pages_artifact_name: \$\{\{ steps\.pages_identity\.outputs\.artifact_name \}\}/);
  assert.match(publish, /sha256sum --check SHA256SUMS/);
  assert.match(publish, /Reauthorize delisting before publication/);
  assert.match(publish, /upload-pages-artifact@[a-f0-9]{40}/);
  assert.match(publish, /git add registry\.json site\/catalog\.json site\/explorer-data\.json site\/assets\/img\/themes\//);
  assert.match(publish, /refusing to publish stale artifacts/);
  assert.match(publish, /git diff --exit-code HEAD -- site/);
  assert.match(publish, /git ls-files --others --exclude-standard -- site/);
  assert.ok(publish.indexOf("upload-pages-artifact@") < publish.indexOf("push origin HEAD:main"));
  assert.ok(publish.indexOf("push origin HEAD:main") < publish.indexOf("git diff --exit-code HEAD -- site"));
  assert.equal((publish.match(/push origin HEAD:main/g) || []).length, 1);
  assert.doesNotMatch(publish, /node |npm |scripts\//);
});

test("delisting deploys only the exact artifact from the guarded publisher", () => {
  const deploy = jobSource("deploy");
  assert.match(deploy, /needs: publish/);
  assert.match(deploy, /permissions:\n      contents: read\n      pages: write\n      id-token: write/);
  assert.match(deploy, /group: github-pages-deployments/);
  assert.match(deploy, /configure-pages@[a-f0-9]{40}/);
  assert.match(deploy, /deploy-pages@[a-f0-9]{40}/);
  assert.match(deploy, /artifact_name: \$\{\{ needs\.publish\.outputs\.pages_artifact_name \}\}/);
  assert.doesNotMatch(deploy, /contents: write|git |npm |node |scripts\//);
});

test("every third-party delisting action is pinned to a full commit", () => {
  const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(actionReferences.length > 0);
  assert.ok(actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference)));
});
