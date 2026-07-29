#!/usr/bin/env node
/**
 * guard-scope.mjs — a PR may only touch files the active task card allows.
 * This is the primary anti-drift mechanism: it makes "while I was in there…"
 * a build failure rather than a code-review conversation.
 *
 * Usage: node scripts/guard-scope.mjs [baseRef]   (default: origin/main)
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'origin/main';
const state = JSON.parse(readFileSync('tasks/STATE.json', 'utf8'));
const taskId = state.activeTask;

if (!taskId) {
  console.error('✗ tasks/STATE.json has no activeTask. Claim a task before opening a PR.');
  process.exit(1);
}

const card = JSON.parse(readFileSync(`tasks/${taskId}.json`, 'utf8'));

// --- tamper check -----------------------------------------------------------
// The card defines the scope, so the card cannot be edited by the work it scopes.
// Widening mayTouch or maxFiles inside your own PR defeats the entire guard.
let cardAtBase;
try {
  cardAtBase = JSON.parse(
    execSync(`git show ${base}:tasks/${taskId}.json`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }),
  );
} catch {
  console.error(`✗ tasks/${taskId}.json does not exist on ${base}.`);
  console.error('  Task cards are authored and merged BEFORE the work begins. Escalate.');
  process.exit(1);
}

const scopeChanged =
  JSON.stringify(cardAtBase.mayTouch) !== JSON.stringify(card.mayTouch) ||
  cardAtBase.maxFiles !== card.maxFiles;

if (scopeChanged) {
  console.error('✗ This PR modifies its own task card scope.');
  console.error(`    maxFiles ${cardAtBase.maxFiles} → ${card.maxFiles}`);
  console.error(`    mayTouch ${cardAtBase.mayTouch.length} → ${card.mayTouch.length} entries`);
  console.error('  Scope changes are a separate, human-reviewed PR. Escalate instead.');
  process.exit(1);
}


const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

if (changed.length === 0) {
  console.error('✗ No changes detected against ' + base);
  process.exit(1);
}

// Files the task card permits, plus the bookkeeping files every task updates.
const permitted = [...card.mayTouch, 'tasks/STATE.json', `tasks/${taskId}.json`];
const matches = (file) => permitted.some((glob) => {
  const rx = new RegExp('^' + glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*') + '$');
  return rx.test(file);
});

const strays = changed.filter((f) => !matches(f));

console.log(`task ${taskId}: ${card.title}`);
console.log(`changed ${changed.length} file(s), budget ${card.maxFiles}`);

let failed = false;

if (strays.length) {
  failed = true;
  console.error(`\n✗ ${strays.length} file(s) outside the task scope:`);
  strays.forEach((f) => console.error(`    ${f}`));
  console.error('\n  Allowed by this card:');
  card.mayTouch.forEach((g) => console.error(`    ${g}`));
  console.error('\n  If the fix genuinely requires these files, STOP and escalate.');
  console.error('  Do not widen mayTouch yourself — that defeats the guard.');
}

if (changed.length > card.maxFiles) {
  failed = true;
  console.error(`\n✗ ${changed.length} files changed, card allows ${card.maxFiles}.`);
  console.error('  A task that grew past its budget is a task that was mis-scoped. Escalate.');
}

process.exit(failed ? 1 : 0);
