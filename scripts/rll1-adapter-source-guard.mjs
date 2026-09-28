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

const retiredFiles = [
  'scripts/rll1-antigravity-worker.ps1',
  'scripts/install-rll1-antigravity-sidecar.ps1',
  'docs/RLL1_LOCAL_AUTOMATION.md',
];

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

includesAll('rule', rule, [
  'AGENTS.md',
  'RLL_EXECUTION_V1',
  'BRANCH_RESUME',
  'EXACT_HEAD_EVIDENCE',
  'RELAY_DIRECTIVE_V1',
  'CODEX_LOCAL_V1',
  'pdfhub-rll-local',
  'e551cb50941b160b50cc21ea76888f2b962ca248',
]);

includesAll('wrapper', wrapper, [
  'rll_worker.py',
  'reallaksh19/Pdf-Hub',
  'pdfhub-rll-local',
  '--authorized-login',
  '--executor',
  'codex',
  '--effort',
  '--smoke',
  'codex login status',
  'e551cb50941b160b50cc21ea76888f2b962ca248',
]);

includesAll('installer', installer, [
  'ScheduledTasks',
  'Register-ScheduledTask',
  'New-ScheduledTaskSettingsSet',
  'MultipleInstances IgnoreNew',
  'pdfhub-rll-local',
  'codex-conformance.json',
  'EnableExecution',
  'smoke = (-not $EnableExecution.IsPresent)',
  'LogonType Interactive',
  'RunLevel Limited',
]);

includesAll('conformance', conformance, [
  'codex login status',
  "'--sandbox', 'read-only'",
  "'--sandbox', 'workspace-write'",
  "'--output-schema'",
  "'--output-last-message'",
  'PDF_HUB_RLL_CODEX_CONFORMANCE_V1',
  'RLL_CODEX_WRITE_OK',
]);

includesAll('docs', docs, [
  'Windows Task Scheduler',
  'CODEX_LOCAL_V1',
  'rll1-codex-conformance.ps1',
  'rll1-codex-worker.ps1',
  'RLL_EXECUTION_V1',
  'pdfhub-rll-local',
  'e551cb50941b160b50cc21ea76888f2b962ca248',
]);

for (const retired of retiredFiles) {
  check(!fs.existsSync(path.join(root, retired)), 'retired adapter file still exists: ' + retired);
}

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
  'gh_token =',
  'github_token =',
  'oauth_token',
]) {
  check(!adapterText.includes(forbidden), 'forbidden adapter authority/dependency found: ' + forbidden);
}

if (failures.length) {
  console.error('RLL-1 Codex adapter audit FAILED (' + failures.length + '/' + checks + ' checks failed)');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('RLL-1 Codex adapter audit PASS (' + checks + '/' + checks + ' checks passed)');
}
