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
    `[phase8-history-writer-single-helper] ${message}`,
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

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

const storePath =
  'src/core/writer-v2/writerV2Store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  'dispatchWriterCommandDurableLatest: (',
  'factory: (',
  'state: WriterV2StoreState',
  'return get().dispatchWriterCommandDurableLatest(',
  'const command = factory(beforeStore)',
  'await commitDurableStateMutation(async () => {',
  'const command = factory(beforeStore);',
]);

const storeTestsPath =
  'src/core/writer-v2/writerV2Store.durableHistory.test.ts';
const storeTests = read(storeTestsPath);
requireContains(storeTests, storeTestsPath, [
  'builds queued durable commands from the latest committed Writer state',
  "backgroundColor: '#fee2e2'",
  'borderWidth: 4',
]);

const helperPath =
  'src/core/writer-v2/durableWriterHelperDispatch.ts';
const helper = read(helperPath);
requireContains(helper, helperPath, [
  'dispatchDurableWriterHelperLatest',
  '.dispatchWriterCommandDurableLatest(',
  "'Durable Writer helper mutation failed'",
  'changed: false',
]);

const helperTestPath =
  'src/core/writer-v2/durableWriterHelperDispatch.test.ts';
const helperTests = read(helperTestPath);
requireContains(helperTests, helperTestPath, [
  'returns committed changed/reason from the latest-state durable factory',
  'logs and converts durable failures into unchanged helper results',
  "'journal write failed'",
]);

for (const relativePath of [
  'src/core/writer-v2/writerReviewActions.ts',
  'src/core/writer-v2/writerGeometryActions.ts',
  'src/core/writer-v2/writerTableBoxActions.ts',
  'src/core/writer-v2/writerImageBoxActions.ts',
  'src/core/writer-v2/writerQuickTemplates.ts',
]) {
  const source = read(relativePath);
  forbidContains(source, relativePath, [
    'dispatchWriterCommand({',
  ]);
}

const reviewPath =
  'src/core/writer-v2/writerReviewActions.ts';
const review = read(reviewPath);
requireContains(review, reviewPath, [
  'export async function ensureActiveWriterReviewMetadata',
  'export async function updateActiveWriterReviewMetadata',
  'export async function updateWriterReviewMetadataById',
  'export async function clearActiveWriterReviewMetadata',
  'export async function markActiveWriterReviewResolved',
  'dispatchDurableWriterHelperLatest(',
  'const previous = current.review',
]);

const geometryPath =
  'src/core/writer-v2/writerGeometryActions.ts';
const geometry = read(geometryPath);
requireContains(geometry, geometryPath, [
  'export async function updateActiveWriterElementGeometry',
  'dispatchDurableWriterHelperLatest(',
  'patch.x',
  'element.rect.x',
]);

const tablePath =
  'src/core/writer-v2/writerTableBoxActions.ts';
const table = read(tablePath);
requireContains(table, tablePath, [
  'type TableMutation',
  'async function commitTableMutation',
  'dispatchDurableWriterHelperLatest(',
  'cloneTableData(table.tableData)',
  'if (!mutate(tableData))',
]);

const imagePath =
  'src/core/writer-v2/writerImageBoxActions.ts';
const image = read(imagePath);
requireContains(image, imagePath, [
  'export async function clearActiveImageBoxAsset',
  "'Writer image clear'",
  'dispatchDurableWriterHelperLatest(',
  'imageAssetId: undefined',
  'assetIds: []',
]);

const templatePath =
  'src/core/writer-v2/writerQuickTemplates.ts';
const template = read(templatePath);
requireContains(template, templatePath, [
  'await applyTemplateReviewMetadata(',
  'updateWriterReviewMetadataById(',
  'await updateWriterReviewMetadataById(',
]);

const inspectorPath =
  'src/components/writer-v2/WriterV2Inspector.tsx';
const inspector = read(inspectorPath);
requireContains(inspector, inspectorPath, [
  'function DraftTextInput',
  'onBlur={commit}',
  "event.key === 'Escape'",
  'updateActiveTableColumnLabel(',
  'updateActiveTableCell(',
  'ariaLabel="Writer review assignee"',
  'void ensureActiveWriterReviewMetadata()',
  'void clearActiveImageBoxAsset()',
]);
forbidContains(inspector, inspectorPath, [
  'onChange={(event) =>\n                    updateActiveTableColumnLabel',
  'onChange={(event) => {\n                        if (!cell) return;\n                        updateActiveTableCell',
]);

const inspectorTestsPath =
  'src/components/writer-v2/WriterV2Inspector.test.tsx';
const inspectorTests = read(inspectorTestsPath);
requireContains(inspectorTests, inspectorTestsPath, [
  'keeps helper-backed table cell text local until blur',
  "'Draft A1'",
]);

const geometryPanelPath =
  'src/components/writer-v2/WriterGeometryQuickPanel.tsx';
const geometryPanel = read(geometryPanelPath);
requireContains(geometryPanel, geometryPanelPath, [
  'const apply = async () => {',
  'await updateActiveWriterElementGeometry({',
  'void apply();',
]);

for (const deferredPath of [
  'src/core/ocr/ocrWriterBridge.ts',
  'src/core/writer-v2/writerLegacyObjectConsolidation.ts',
]) {
  const source = read(deferredPath);
  if (!source.includes('dispatchWriterCommand(')) {
    fail(
      `C2C1 deferred mutation boundary unexpectedly moved: ${deferredPath}`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-history-writer-single-helper] single-element Writer helper durability guards passed',
);
