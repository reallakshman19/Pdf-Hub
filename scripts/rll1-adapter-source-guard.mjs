import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const files = {
  rule: '.agents/rules/rll-1.md',
  wrapper: 'scripts/rll1-antigravity-worker.ps1',
  installer: 'scripts/install-rll1-antigravity-sidecar.ps1',
  guard: 'scripts/rll1-adapter-source-guard.mjs',
  docs: 'docs/RLL1_LOCAL_AUTOMATION.md',
};

let checks = 0;
const failures = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function read(relativePath) {
  const full = path.join(root, relativePath);
  check(fs.existsSync(full), `missing adapter file: ${relativePath}`);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function includesAll(name, content, tokens) {
  for (const token of tokens) {
    check(content.includes(token), `${name} missing required token: ${token}`);
  }
}

const rule = read(files.rule);
const wrapper = read(files.wrapper);
const installer = read(files.installer);
const docs = read(files.docs);
read(files.guard);

includesAll('rule', rule, [
  'AGENTS.md',
  'RLL-1',
  'RLL_EXECUTION_V1',
  'BRANCH_RESUME',
  'EXACT_HEAD_EVIDENCE',
  'RELAY_DIRECTIVE_V1',
  'git',
  'gh',
  '8c013591659cbf42111d9d61d102e338f462cff5',
]);

includesAll('wrapper', wrapper, [
  'skills\\engineering-pr-delivery-v3.1\\scripts\\rll_worker.py',
  'reallaksh19/Pdf-Hub',
  'antigravity-local',
  'reallaksh19',
  '--authorized-login',
  '--effort',
  '--smoke',
  'RLL_SMOKE',
  '8c013591659cbf42111d9d61d102e338f462cff5',
]);

includesAll('installer', installer, [
  'rll-ready',
  'rll-active',
  'rll-review-ready',
  'rll-escalation',
  "builtin = 'schedule'",
  "'*/10 * * * *'",
  'RLL_SMOKE',
  "'1'",
  '.gemini\\config',
  'sidecar.json',
]);

includesAll('docs', docs, [
  'RLL_EXECUTION_V1',
  'BRANCH_RESUME',
  'EXACT_HEAD_EVIDENCE',
  'RELAY_DIRECTIVE_V1',
  'RLL_SMOKE=1',
  'RLL_SMOKE=0',
  'gh auth login',
  '8c013591659cbf42111d9d61d102e338f462cff5',
]);

for (const forbiddenPath of [
  'scripts/rll_worker.py',
  'schemas/rll-execution.schema.json',
  'schemas/rll-worker-state.schema.json',
  'schemas/rll-directive.schema.json',
  'schemas/rll-run-result.schema.json',
]) {
  check(!fs.existsSync(path.join(root, forbiddenPath)), `generic Common RLL file must not be forked locally: ${forbiddenPath}`);
}

const adapterText = [rule, wrapper, installer, docs].join('\n').toLowerCase();
for (const forbidden of [
  'gh pr merge',
  'gh release create',
  'git push --force',
  'git branch -d ',
  '--dangerously-skip-permissions',
  'mcp__github__',
  'github-mcp-server',
]) {
  check(!adapterText.includes(forbidden), `forbidden adapter authority/dependency found: ${forbidden}`);
}

if (failures.length) {
  console.error(`RLL-1 adapter audit FAILED (${failures.length}/${checks} checks failed)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`RLL-1 adapter audit PASS (${checks}/${checks} checks passed)`);
}
