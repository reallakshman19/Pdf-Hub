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
    `[phase8-history-replayability] ${message}`,
  );
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

const policyPath =
  'src/core/document-history/replayability.ts';
const policy = read(policyPath);

requireContains(policy, policyPath, [
  "'SELF_CONTAINED_REPLAY'",
  "'CHECKPOINT_REQUIRED'",
  "'NON_MUTATING'",
  "'DONOR_RESOURCE_REQUIRED'",
  "'BINARY_RESOURCE_REQUIRED'",
  "'DESCRIPTIVE_STATE_COMMAND'",
  "'EXTERNAL_FILE_NAME_CONTEXT'",
  "'LOCALE_SENSITIVE_DATE_CONTEXT'",
  "'EXTERNAL_TEMPLATE_CONTEXT'",
  "'ARTIFACT_SIDE_EFFECT'",
  'classifyHistoryReplayability',
  'classifyHeaderFooter',
  'classifyDrawText',
  'assertNever(command)',
  "case 'INSERT_PAGES'",
  "case 'REPLACE_PAGE'",
  "case 'MERGE_PDF'",
  "case 'APPLY_WORKING_COPY'",
  "case 'ANNOTATION_CHANGE'",
  "case 'WRITER_CHANGE'",
  "case 'EXTRACT_PAGES'",
  "case 'SPLIT_PAGES'",
  "case 'REPLACE_EXISTING_TEXT'",
  "case 'RECONSTRUCT_EXISTING_TEXT'",
]);

const testPath =
  'src/core/document-history/__tests__/replayability.test.ts';
const test = read(testPath);

requireContains(test, testPath, [
  'satisfies Record<PdfCommandType, HistoryReplayDisposition>',
  'keeps the policy command set exhaustive with PdfCommandType',
  'reports the split artifact side-effect barrier',
  'reports exact donor and binary resource barriers',
  'requires a checkpoint for image-bearing or external-context header/footer templates',
  'treats deterministic header/footer date and page tokens as replayable',
  'requires external context only when enabled legacy text tokens are actually present',
]);

const commandTypesPath = 'src/core/commands/types.ts';
const commandTypes = read(commandTypesPath);
const commandTypeNames = [
  'ROTATE_PAGES',
  'REORDER_PAGES',
  'REORDER_PAGES_BY_ORDER',
  'EXTRACT_PAGES',
  'SPLIT_PAGES',
  'DELETE_PAGES',
  'INSERT_PAGES',
  'INSERT_BLANK_PAGE',
  'REPLACE_PAGE',
  'DUPLICATE_PAGES',
  'MERGE_PDF',
  'SET_PAGE_LABELS',
  'APPLY_HEADER_FOOTER_TEMPLATE',
  'DRAW_TEXT_ON_PAGES',
  'DRAW_REDACTION_BOX',
  'REPLACE_EXISTING_TEXT',
  'RECONSTRUCT_EXISTING_TEXT',
  'ANNOTATION_CHANGE',
  'WRITER_CHANGE',
  'APPLY_WORKING_COPY',
];

for (const type of commandTypeNames) {
  if (!commandTypes.includes(`'${type}'`)) {
    fail(
      `Canonical command type disappeared from types.ts: ${type}`,
    );
  }
  if (!policy.includes(`'${type}'`)) {
    fail(
      `Replayability policy does not mention canonical command type: ${type}`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-history-replayability] exhaustive replay/checkpoint/non-mutating command policy guards passed',
);
