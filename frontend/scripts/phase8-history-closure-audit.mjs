import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function fail(message) {
  failed = true;
  console.error(
    `[phase8-history-closure] ${message}`,
  );
}

function requireContains(
  source,
  relativePath,
  markers,
) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function requireOrder(
  source,
  relativePath,
  before,
  after,
) {
  const beforeIndex =
    source.indexOf(before);
  const afterIndex =
    source.indexOf(
      after,
      Math.max(0, beforeIndex),
    );
  if (
    beforeIndex < 0
    || afterIndex < 0
    || beforeIndex >= afterIndex
  ) {
    fail(
      `${relativePath} must contain ${before} before ${after}`,
    );
  }
}

const closurePath =
  'src/core/document-history/__tests__/phase8Closure.integration.test.ts';
const closure = read(closurePath);

requireContains(
  closure,
  closurePath,
  [
    'class RestartableRevisionStore',
    'class RestartableJournalStore',
    'restartableWriterPersistence',
    'persistent: true',
    "'CHECKPOINT_REQUIRED' as const",
    "'DESCRIPTIVE_STATE_COMMAND' as const",
    "'DONOR_RESOURCE_REQUIRED' as const",
    "'SELF_CONTAINED_REPLAY' as const",
    'planHistoryRecovery(',
    'resolveHistoryRecoveryPlan(',
    'executeHistoryRecovery({',
    'clearWorkingRevisionStoreRegistryForTests()',
    'clearHistoryJournalStoreRegistryForTests()',
    'useAnnotationStore',
    'clearWriterV2()',
    'clearOcr()',
    'installFreshProcess(',
    'recoverFromBacking(',
    'executeRevisionGarbageCollection(',
    'MISSING_REFERENCED_REVISION',
    "'REVISION_MISSING'",
    "'UNSAFE_REACHABILITY'",
    'survives safe GC',
    'Second restart uses new store/persistence objects',
  ],
);

requireOrder(
  closure,
  closurePath,
  'destroyProcessState();',
  'const first =',
);
requireOrder(
  closure,
  closurePath,
  'executeRevisionGarbageCollection(',
  'const second =',
);
requireOrder(
  closure,
  closurePath,
  'await second.revisions.remove(',
  'resolveHistoryRecoveryPlan(',
);
requireOrder(
  closure,
  closurePath,
  "code: 'REVISION_MISSING'",
  'const damagedGcPlan =',
);
requireOrder(
  closure,
  closurePath,
  'damagedGcPlan.safeToDelete',
  'executeRevisionGarbageCollection(',
);

const packagePath =
  'package.json';
const packageJson =
  JSON.parse(read(packagePath));
if (
  packageJson.scripts[
    'certify:phase8e-closure'
  ] !==
  'npm run certify:phase8e5c4 && npm run audit:phase8-history-closure && vitest run src/core/document-history/__tests__/phase8Closure.integration.test.ts --pool=forks --maxWorkers=1'
) {
  fail(
    'package.json certify:phase8e-closure must chain 8E.5C4, the closure audit and the closure integration fixture.',
  );
}
if (
  packageJson.scripts[
    'audit:phase8-history-closure'
  ] !==
  'node scripts/phase8-history-closure-audit.mjs'
) {
  fail(
    'package.json is missing audit:phase8-history-closure.',
  );
}

const architecturePath =
  '../ARCHITECTURE.md';
const architecture =
  read(architecturePath);
requireContains(
  architecture,
  architecturePath,
  [
    'WP-8E closure certification',
    'process-death reconstruction',
    'safe revision GC',
    'damaged recovery graph',
    'WP-8F',
  ],
);

const roadmapPath =
  '../agents/relay/roadmap/OVERALL_ROADMAP.yaml';
const roadmap =
  read(roadmapPath);
requireContains(
  roadmap,
  roadmapPath,
  [
    '"id": "WP-8E"',
    '"issue": 280',
    '"id": "WP-8F"',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-history-closure] process-death recovery and GC closure guards passed',
);
