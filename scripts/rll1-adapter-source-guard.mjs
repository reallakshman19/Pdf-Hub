import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const files = {
  rule: '.agents/rules/rll-1.md',
  wrapper: 'scripts/rll1-codex-worker.ps1',
  installer: 'scripts/install-rll1-codex-task.ps1',
  conformance: 'scripts/rll1-codex-conformance.ps1',
  guard: 'scripts/rll1-adapter-source-guard.mjs',
  docs: 'docs/RLL1_CODEX_LOCAL_AUTOMATION.md',
};

let checks = 0;
const failures = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function read(relativePath) {
  const full = path.join(root, relativePath);
  check(fs.existsSync(full), 'missing adapter file: ' + relativePath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function includesAll(name, content, tokens) {
  for (const token of tokens) {
    check(content.includes(token), name + ' missing required token: ' + token);
  }
}

const rule = read(files.rule);
const wrapper = read(files.wrapper);
const installer = read(files.installer);
const conformance = read(files.conformance);
const docs = read(files.docs);
read(files.guard);

const basis = '22d365839e64c19c7ba606e2cf4edc6b9cc2999f';

includesAll('rule', rule, [
  'AGENTS.md',
  'RLL_EXECUTION_V1',
  'BRANCH_RESUME',
  'EXACT_HEAD_EVIDENCE',
  'RELAY_DIRECTIVE_V1',
  'CODEX_LOCAL_V1',
  'codex-local',
  'WSL2',
  'allowed_paths',
  'launcher-owned commit/push',
  'GH_TOKEN',
  basis,
]);

includesAll('wrapper', wrapper, [
  'wsl.exe',
  'codex-local',
  '--executor',
  'codex',
  '--codex-user',
  '--codex-home',
  '--authorized-login',
  '--smoke',
  "'-u', 'GH_TOKEN'",
  "'-u', 'GITHUB_TOKEN'",
  'sudo -n -u',
  basis,
]);

includesAll('installer', installer, [
  'ScheduledTasks',
  'Register-ScheduledTask',
  'New-ScheduledTaskSettingsSet',
  'MultipleInstances IgnoreNew',
  'LogonType Interactive',
  'RunLevel Limited',
  'WSL2',
  'codex-local',
  "CodexUser = 'rll-codex'",
  "CodexHome = '/home/rll-codex/.codex-rll'",
  'Copy-Item -Path $SourceWrapperPath -Destination $InstalledWrapperPath -Force',
  "Join-Path $BinRoot 'rll1-codex-worker.ps1'",
  'RLL_WORKER_STATE_V1',
  'REVIEW_READY|CANCELLED',
  'GH_TOKEN',
  'gh auth login --web',
  basis,
]);

includesAll('conformance', conformance, [
  'WSL2',
  'codex-local',
  "CodexUser = 'rll-codex'",
  "CodexHome = '/home/rll-codex/.codex-rll'",
  'provider GitHub authentication',
  'Dedicated Codex identity unexpectedly has GitHub provider authentication',
  "'--sandbox', 'read-only'",
  "'--sandbox', 'workspace-write'",
  "'--json'",
  "'--output-schema'",
  "'--output-last-message'",
  'approvals_reviewer="user"',
  'web_search="disabled"',
  'sandbox_workspace_write.network_access=false',
  'PDF_HUB_RLL_CODEX_CONFORMANCE_V2',
  'RLL_CODEX_WRITE_OK',
  'Wait-Job -Job $Job -Timeout $TimeoutSeconds',
  basis,
]);

includesAll('docs', docs, [
  'Windows Task Scheduler',
  'WSL2/Linux',
  'codex-local',
  'rll-codex',
  '/home/rll-codex/.codex-rll',
  'allowed_paths',
  'launcher-owned commit/push',
  'branch-independent',
  'GH_TOKEN',
  'exact-head Codex smoke',
  'overlap smoke',
  'fresh disposable WSL2/Linux branch-write smoke',
  'contentStreamScanner.ts',
  basis,
]);

for (const forbiddenPath of [
  'scripts/rll_worker.py',
  'schemas/rll-execution.schema.json',
  'schemas/rll-worker-state.schema.json',
  'schemas/rll-directive.schema.json',
  'schemas/rll-run-result.schema.json',
]) {
  check(!fs.existsSync(path.join(root, forbiddenPath)), 'generic Common RLL file must not be forked locally: ' + forbiddenPath);
}

const adapterText = [rule, wrapper, installer, conformance, docs].join('\n').toLowerCase();
for (const forbidden of [
  'pdfhub-rll-local',
  'e551cb50941b160b50cc21ea76888f2b962ca248',
  'antigravity',
  'agy ',
  'sidecar',
  'gh pr merge',
  'gh release create',
  'git push --force',
  'git branch -d ',
  'danger-full-access',
  '--dangerously-bypass-approvals-and-sandbox',
  '--full-auto',
  'mcp__github__',
  'github-mcp-server',
  'native-windows codex conformance',
  'native-windows workspace-write',
  'gh_token =',
  'github_token =',
  'oauth_token',
]) {
  check(!adapterText.includes(forbidden), 'forbidden stale/authority/dependency token found: ' + forbidden);
}

if (failures.length) {
  console.error('RLL-1 Codex adapter audit FAILED (' + failures.length + '/' + checks + ' checks failed)');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('RLL-1 Codex adapter audit PASS (' + checks + '/' + checks + ' checks passed)');
}
