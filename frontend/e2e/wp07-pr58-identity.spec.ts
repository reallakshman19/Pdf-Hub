import { test, expect, type Page } from '@playwright/test';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

/**
 * WP07 M03 native-output challenge. Unlike the unit tests, these journeys
 * drive the deployed React entrypoint, its recipe JSON importer, preflight,
 * canonical macro runner, normal Save and an independently parsed PDF.
 */
async function persistPublicSyntheticEvidence(name: string, bytes: Uint8Array | Buffer): Promise<void> {
  const dir = process.env.WP07_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${name}`, bytes);
}

async function createThreePageSource(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const marker of ['A', 'B', 'C']) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`WP07 NATIVE SOURCE PAGE ${marker}`, {
      x: 72,
      y: 720,
      size: 16,
      font,
    });
  }
  return pdf.save();
}

/** Native PDF page tree + direct PDF note annotation, not a DOM overlay. */
async function createR5RotatedAnnotatedSource(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of ['A', 'B', 'C']) {
    const page = document.addPage([612, 792]);
    page.drawText(`WP07 R5 NATIVE ANNOTATED PAGE ${label}`, {
      x: 80, y: 704, font, size: 17,
    });
    if (label === 'A') {
      page.setRotation(degrees(90));
      const note = document.context.register(document.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        NM: PDFString.of('WP07-R5-AUTHORITATIVE-NOTE'),
        Contents: PDFString.of('R5 owner note remains on source page A'),
        Rect: [130, 410, 152, 432],
        P: page.ref,
      }));
      page.node.set(PDFName.of('Annots'), document.context.obj([note]));
    }
  }
  return new Uint8Array(await document.save());
}

async function openDocumentAndBuilder(page: Page): Promise<void> {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible();

  const bytes = await createThreePageSource();
  const sourceFile = Buffer.from(bytes);
  const sourceSha256 = createHash('sha256').update(sourceFile).digest('hex');
  await persistPublicSyntheticEvidence(`source-${sourceSha256}.pdf`, sourceFile);
  await test.info().attach('ALT-WP07_native-source.pdf', {
    body: sourceFile,
    contentType: 'application/pdf',
  });
  process.stdout.write((`ALT_WP07_SOURCE sha256=${sourceSha256} pages=3`) + '\n');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'wp07-three-page-source.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  const sidebar = page.getByTestId('automate-sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: 'Build', exact: true }).click();
  await sidebar.getByRole('button', { name: 'Open Workflow Builder' }).click();
  const builder = page.locator('[data-macro-builder="true"]');
  await expect(builder).toBeVisible();
  await builder.getByTestId('macro-builder-advanced').locator('summary').click();
}

async function importRecipe(page: Page, steps: unknown[]): Promise<void> {
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByLabel('Macro JSON').fill(JSON.stringify({
    id: 'alt-wp07-native-parity',
    name: 'ALT WP07 native parity',
    steps,
  }));
  await builder.getByRole('button', { name: 'Import JSON' }).click();
  await expect(builder.getByText('Recipe is valid.')).toBeVisible();
}

async function saveAndInspect(page: Page): Promise<string[]> {
  const builder = page.locator('[data-macro-builder="true"]');
  if (await builder.count()) {
    await builder.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(builder).toHaveCount(0);
  }
  await page.getByRole('tab', { name: 'File' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has(svg.lucide-save.w-4)').click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  const file = await readFile(path as string);
  const outputSha256 = createHash('sha256').update(file).digest('hex');
  await persistPublicSyntheticEvidence(`export-${outputSha256}.pdf`, file);
  await test.info().attach('ALT-WP07_native-export.pdf', {
    body: file,
    contentType: 'application/pdf',
  });
  const native = await getDocument({ data: new Uint8Array(file).slice() }).promise;
  const markers: string[] = [];
  try {
    for (let index = 1; index <= native.numPages; index += 1) {
      const nativePage = await native.getPage(index);
      const content = await nativePage.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      const marker = text.match(/WP07 NATIVE SOURCE PAGE ([ABC])/);
      expect(marker, `native PDF page ${index} source identity`).not.toBeNull();
      markers.push(marker?.[1] ?? 'MISSING');
    }
  } finally {
    await native.destroy();
  }
  const witness = {
    origin: 'PDF_HUB_REAL_BROWSER_EXPORT',
    source_kind: 'PUBLIC_SYNTHETIC',
    output_sha256: outputSha256,
    page_count: markers.length,
    source_identity_order: markers,
    check: 'pdfjs-dist independent native PDF readback',
  };
  await test.info().attach('ALT-WP07_native-inspection.json', {
    body: Buffer.from(JSON.stringify(witness, null, 2)),
    contentType: 'application/json',
  });
  await persistPublicSyntheticEvidence(
    `witness-${outputSha256}.json`,
    Buffer.from(JSON.stringify(witness, null, 2)),
  );
  process.stdout.write(`ALT_WP07_EXPORT sha256=${outputSha256} pages=${markers.length} source_order=${markers.join(',')}\n`);
  return markers;
}

test('WP07 M03: two-step duplicate produces native page order A,A,B,C,C', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'select_pages', selector: { mode: 'list', pages: [3, 1, 3] } },
    { op: 'duplicate_pages', selector: { mode: 'selected' } },
  ]);

  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-preflight')).toContainText('3 → 5');
  await expect(builder.getByText('Test Run complete.', { exact: false })).toBeVisible();

  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible({
    timeout: 20_000,
  });

  const actual = await saveAndInspect(page);
  expect(actual).toEqual(['A', 'A', 'B', 'C', 'C']);
});

test('WP07 M03: original B survives removal and is duplicated after selection remap', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'select_pages', selector: { mode: 'list', pages: [2] } },
    { op: 'remove_pages', selector: { mode: 'list', pages: [1] } },
    { op: 'duplicate_pages', selector: { mode: 'selected' } },
  ]);
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-preflight')).toContainText('3 → 3');
  await expect(builder.getByTestId('macro-builder-run')).toBeEnabled();
  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible({ timeout: 20_000 });
  const sourceOrder = await saveAndInspect(page);
  expect(sourceOrder).toEqual(['B', 'B', 'C']);
});

test('WP07 M03: remove-all preflight blocks Run and preserves native source', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'remove_pages', selector: { mode: 'all' } },
  ]);

  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  const preflight = builder.getByTestId('macro-builder-preflight');
  await expect(preflight).toContainText('Cannot remove all pages');
  await expect(builder.getByTestId('macro-builder-run')).toBeDisabled();
  await expect(builder.getByText('Test Run found blocking issues.')).toBeVisible();

  const actual = await saveAndInspect(page);
  expect(actual).toEqual(['A', 'B', 'C']);
});

test('WP07 M03: undo and redo recover the original and transformed native PDF', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'select_pages', selector: { mode: 'list', pages: [1, 3] } },
    { op: 'duplicate_pages', selector: { mode: 'selected' } },
  ]);
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-run')).toBeEnabled();
  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible();
  expect(await saveAndInspect(page)).toEqual(['A', 'A', 'B', 'C', 'C']);

  await page.getByRole('tab', { name: 'Organize' }).click();
  const undo = page.locator('button[title="Undo"]').first();
  await expect(undo).toBeEnabled();
  await undo.click();
  // The document workspace virtualizes pages: a valid three-page document
  // need not mount the DOM node [data-page="3"] in the current viewport.
  // The authoritative check is the saved native PDF, not a virtualized page.
  expect(await saveAndInspect(page)).toEqual(['A', 'B', 'C']);

  await page.getByRole('tab', { name: 'Organize' }).click();
  const redo = page.locator('button[title="Redo"]').first();
  await expect(redo).toBeEnabled();
  await redo.click();
  expect(await saveAndInspect(page)).toEqual(['A', 'A', 'B', 'C', 'C']);
});


test('WP07 M05: generated PDF stays in the session queue until browser receipt is confirmed', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'extract_pages', selector: { mode: 'current' }, outputName: 'wp07-extract.pdf' },
  ]);
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toContainText('queued');
  expect(downloads).toHaveLength(0);

  await builder.getByRole('button', { name: 'Close', exact: true }).click();
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue).toContainText('wp07-extract.pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    queue.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('wp07-extract.pdf');
  const output = await readFile(await download.path() as string);
  const digest = createHash('sha256').update(output).digest('hex');
  await persistPublicSyntheticEvidence(`extract-${digest}.pdf`, output);
  const native = await getDocument({ data: new Uint8Array(output) }).promise;
  try {
    expect(native.numPages).toBe(1);
    const pageOne = await native.getPage(1);
    const text = (await pageOne.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    expect(text).toContain('WP07 NATIVE SOURCE PAGE A');
  } finally {
    await native.destroy();
  }
  await expect(queue).toContainText('Download initiated — receipt unverified');
  await queue.getByRole('button', { name: 'Confirm received' }).click();
  await expect(queue).toHaveCount(0);
  process.stdout.write((`WP07_OUTPUT_CUSTODY sha256=${digest} queued_before_confirm=true pages=1`) + '\n');
});


test('WP07 P0: native annotation ownership follows source B through C,A,B reorder', async ({ page }) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  const bytes = await createThreePageSource();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'wp07-annotated-three-pages.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible();

  // Create an actual PDF-Hub overlay on source B through the live UI.
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await expect(page.locator('[data-page="2"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /Sticky Note/ }).click();
  await page.locator('[data-page="2"]').click({ position: { x: 140, y: 180 } });
  await expect(page.locator('[data-page="2"]').getByText('New note', { exact: true })).toBeVisible();

  // Run a same-count reorder that previously rebound B's note to physical
  // page 2 (source A) instead of retaining its source PageId.
  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Build', exact: true }).click();
  await sidebar.getByRole('button', { name: 'Open Workflow Builder' }).click();
  const builder = page.locator('[data-macro-builder="true"]');
  await expect(builder).toBeVisible();
  await builder.getByTestId('macro-builder-advanced').locator('summary').click();
  await importRecipe(page, [{ op: 'reorder_pages', order: [3, 1, 2] }]);
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-run')).toBeEnabled();
  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible();
  await builder.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has(svg.lucide-save.w-4)').click(),
  ]);
  const saved = new Uint8Array(await readFile(await download.path() as string));
  const sha256 = createHash('sha256').update(saved).digest('hex');
  await persistPublicSyntheticEvidence(`annotated-reordered-${sha256}.pdf`, saved);
  const native = await getDocument({ data: saved.slice() }).promise;
  try {
    expect(native.numPages).toBe(3);
    const order: string[] = [];
    const annotations: number[] = [];
    for (let n = 1; n <= native.numPages; n += 1) {
      const pageNative = await native.getPage(n);
      const content = (await pageNative.getTextContent()).items
        .map((item) => ('str' in item ? item.str : '')).join(' ');
      order.push(content.match(/WP07 NATIVE SOURCE PAGE ([ABC])/)?.[1] ?? 'MISSING');
      annotations.push((await pageNative.getAnnotations({ intent: 'display' })).length);
    }
    expect(order).toEqual(['C', 'A', 'B']);
    expect(annotations[2]).toBeGreaterThanOrEqual(1);
    expect(annotations[1]).toBe(0);
    expect(annotations[0]).toBe(0);
    await persistPublicSyntheticEvidence(
      `annotated-reordered-${sha256}.json`,
      Buffer.from(JSON.stringify({ sha256, page_order: order, annotation_count_by_page: annotations }, null, 2)),
    );
    process.stdout.write(`WP07_ANNOTATION_OWNER sha256=${sha256} order=${order.join(',')} notes=${annotations.join(',')}\n`);
  } finally {
    await native.destroy();
  }
});

test('WP07 M06: visual mask labels match the workflow and covered text remains extractable', async ({ page }) => {
  await openDocumentAndBuilder(page);
  const templates = page.locator('select optgroup[label="Templates"]');
  await expect(templates.locator('option[value="builtin:white-out-redaction"]')).toHaveText('White Visual Mask');
  await expect(templates.locator('option[value="builtin:black-redaction"]')).toHaveText('Black Visual Mask');
  await page.locator('[data-macro-builder="true"]').getByRole('button', { name: 'Close', exact: true }).click();

  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  await page.getByTestId('automate-batch-run').getByRole('button', { name: 'Choose Workflow' }).click();
  const batchPicker = page.getByLabel('Batch workflow');
  await expect(batchPicker.locator('option[value="white-out-redaction"]')).toHaveText('White Visual Mask');
  await expect(batchPicker.locator('option[value="black-redaction"]')).toHaveText('Black Visual Mask');
  await batchPicker.selectOption({ label: 'Black Visual Mask' });

  const marker = 'WP07 COVERED SOURCE TEXT';
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const sourcePage = source.addPage([612, 792]);
  sourcePage.drawText(marker, { x: 72, y: 676, size: 12, font });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles({ name: 'mask-source.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });

  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download', { predicate: (item) => item.suggestedFilename().endsWith('.pdf') }),
    queue.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const output = await readFile(await download.path() as string);
  const native = await getDocument({ data: new Uint8Array(output) }).promise;
  try {
    const outputPage = await native.getPage(1);
    const { fnArray, argsArray } = await outputPage.getOperatorList();
    const maskIndex = fnArray.findIndex((op, index) => op === OPS.constructPath && argsArray[index]?.[0] === OPS.fill);
    expect(maskIndex).toBeGreaterThanOrEqual(0);
    expect(Array.from(argsArray[maskIndex][2] as ArrayLike<number>)).toEqual([0, 0, 300, 30]);
    const maskScope = fnArray.lastIndexOf(OPS.save, maskIndex);
    const maskTransforms = fnArray.flatMap((op, index) => (
      op === OPS.transform && index > maskScope && index < maskIndex
        ? [Array.from(argsArray[index] as ArrayLike<number>)]
        : []
    ));
    expect(maskTransforms).toContainEqual([1, 0, 0, 1, 36, 662]);
    const text = (await outputPage.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
    expect(text).toContain(marker);
  } finally {
    await native.destroy();
  }
});

test('WP07 B01: same-named batch PDFs retain separate hashes, output custody and receipt states', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await expect(batch).toBeVisible();
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await expect(page.getByLabel('Batch workflow')).toHaveValue('review-current-page');

  const makePdf = async (marker: 'A' | 'B') => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const native = doc.addPage([612, 792]);
    native.drawText(`WP07 BATCH SOURCE ${marker}`, { x: 72, y: 700, size: 16, font });
    return Buffer.from(await doc.save());
  };
  const sourceA = await makePdf('A');
  const sourceB = await makePdf('B');
  const shaSource = [sourceA, sourceB].map((bytes) =>
    createHash('sha256').update(bytes).digest('hex'));
  await persistPublicSyntheticEvidence(`batch-source-${shaSource[0]}.pdf`, sourceA);
  await persistPublicSyntheticEvidence(`batch-source-${shaSource[1]}.pdf`, sourceB);

  const initiated: string[] = [];
  page.on('download', (download) => initiated.push(download.suggestedFilename()));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([
    { name: 'repeat.pdf', mimeType: 'application/pdf', buffer: sourceA },
    { name: 'repeat.pdf', mimeType: 'application/pdf', buffer: sourceB },
  ]);
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 25_000 });
  expect(initiated.filter((name) => name.endsWith('.pdf'))).toEqual([]);
  await expect(queue).toContainText('Input #1: repeat.pdf');
  await expect(queue).toContainText('Input #2: repeat.pdf');

  // Browser report download is an initiation, not proof of receipt. Request
  // it through a deliberate UI action and verify the JSON report itself.
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', {
      predicate: (download) => download.suggestedFilename().endsWith('.json'),
    }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string; recipeId: string; recipeSha256: string };
    summary: { succeeded: number };
    records: Array<{
      inputIndex: number; fileName: string; sourceSha256: string;
      outputSha256: string; outputName: string; outputDisposition: string;
    }>;
  };
  expect(report.metadata.recipeId).toBe('review-current-page');
  expect(report.metadata.recipeSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(report.summary.succeeded).toBe(2);
  expect(report.records.map((record) => record.inputIndex)).toEqual([0, 1]);
  expect(report.records.map((record) => record.fileName)).toEqual(['repeat.pdf', 'repeat.pdf']);
  expect(report.records.map((record) => record.sourceSha256)).toEqual(
    shaSource.map((digest) => `sha256:${digest}`),
  );
  expect(new Set(report.records.map((record) => record.outputName)).size).toBe(2);
  expect(report.records.map((record) => record.outputDisposition)).toEqual([
    'handoff-completed-unverified', 'handoff-completed-unverified',
  ]);
  for (const record of report.records) {
    expect(record.outputName).toContain(`${String(record.inputIndex + 1).padStart(3, '0')}-repeat-`);
    expect(record.outputName).toContain(record.sourceSha256.slice(7, 19));
  }
  // Metadata legitimately uses "bytes" as a measurement unit. Reject
  // serialized byte arrays, not the word in measurement labels.
  expect(JSON.stringify(report)).not.toMatch(/"0"\\s*:\\s*\\d+/);
  expect(JSON.stringify(report)).not.toContain('%PDF-');

  for (let index = 0; index < 2; index += 1) {
    const [download] = await Promise.all([
      page.waitForEvent('download', {
        predicate: (d) => d.suggestedFilename().endsWith('.pdf'),
      }),
      queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
    ]);
    const output = await readFile(await download.path() as string);
    const actualDigest = createHash('sha256').update(output).digest('hex');
    expect(`sha256:${actualDigest}`).toBe(report.records[index].outputSha256);
    expect(download.suggestedFilename()).toBe(report.records[index].outputName);
    const doc = await getDocument({ data: new Uint8Array(output) }).promise;
    try {
      expect(doc.numPages).toBe(1);
      const p1 = await doc.getPage(1);
      const text = (await p1.getTextContent()).items.map(
        (item) => 'str' in item ? item.str : '',
      ).join(' ');
      expect(text).toContain(`WP07 BATCH SOURCE ${index === 0 ? 'A' : 'B'}`);
    } finally {
      await doc.destroy();
    }
    await persistPublicSyntheticEvidence(`batch-export-${actualDigest}.pdf`, output);
    await expect(queue).toContainText('Download initiated — receipt unverified');
    await queue.getByRole('button', { name: 'Confirm received' }).first().click();
    if (index === 0) {
      await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1);
    }
  }
  await expect(queue).toHaveCount(0);
  await persistPublicSyntheticEvidence(
    `batch-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
  );
  process.stdout.write((`WP07_BATCH_PROVENANCE run=${report.metadata.runId} inputs=2 queued=2 independent_outputs=2 sha256_verified=true receipts_explicit=true`) + '\n');
});

test('WP07 B02: a corrupt middle input does not steal custody or ordinal from later PDFs', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await expect(page.getByLabel('Batch workflow')).toHaveValue('review-current-page');

  const makePdf = async (marker: string) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const native = doc.addPage([612, 792]);
    native.drawText(`WP07 MIXED SOURCE ${marker}`, { x: 72, y: 700, size: 16, font });
    return Buffer.from(await doc.save());
  };
  const a = await makePdf('A');
  const c = await makePdf('C');
  const broken = Buffer.from([1, 2, 3, 4, 5]);
  const sourceDigests = [a, c].map((bytes) => createHash('sha256').update(bytes).digest('hex'));
  await persistPublicSyntheticEvidence(`mixed-source-${sourceDigests[0]}.pdf`, a);
  await persistPublicSyntheticEvidence(`mixed-source-${sourceDigests[1]}.pdf`, c);

  const pending: string[] = [];
  page.on('download', (download) => pending.push(download.suggestedFilename()));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([
    { name: 'repeat.pdf', mimeType: 'application/pdf', buffer: a },
    { name: 'corrupt.pdf', mimeType: 'application/pdf', buffer: broken },
    { name: 'repeat.pdf', mimeType: 'application/pdf', buffer: c },
  ]);
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 25_000 });
  expect(pending.filter((name) => name.endsWith('.pdf'))).toEqual([]);
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', {
      predicate: (d) => d.suggestedFilename().endsWith('.json'),
    }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string };
    records: Array<{
      inputIndex: number; status: string; sourceSha256?: string;
      outputSha256?: string; outputName?: string; error?: string;
    }>;
    summary: { selected: number; succeeded: number; failed: number; notRun: number };
    evidence: { diagnostics: Array<{ code: string; inputIndex?: number }> };
  };
  expect(report.summary).toMatchObject({ selected: 3, succeeded: 2, failed: 1, notRun: 0 });
  expect(report.records.map((record) => [record.inputIndex, record.status])).toEqual([
    [0, 'success'], [1, 'failed'], [2, 'success'],
  ]);
  expect(report.records[0].sourceSha256).toBe(`sha256:${sourceDigests[0]}`);
  expect(report.records[2].sourceSha256).toBe(`sha256:${sourceDigests[1]}`);
  expect(report.records[0].outputName).toMatch(/^001-repeat-/);
  expect(report.records[2].outputName).toMatch(/^003-repeat-/);
  expect(report.records[1].outputName).toBeUndefined();
  expect(report.evidence.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'PDF_SIGNATURE_MISSING', inputIndex: 1 }),
  ]));

  for (const [queueIndex, recordIndex, marker] of [[0, 0, 'A'], [1, 2, 'C']] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
      queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
    ]);
    const output = await readFile(await download.path() as string);
    const actualHash = createHash('sha256').update(output).digest('hex');
    expect(`sha256:${actualHash}`).toBe(report.records[recordIndex].outputSha256);
    expect(download.suggestedFilename()).toBe(report.records[recordIndex].outputName);
    const doc = await getDocument({ data: new Uint8Array(output) }).promise;
    try {
      const native = await doc.getPage(1);
      const text = (await native.getTextContent()).items.map((item) =>
        'str' in item ? item.str : '',
      ).join(' ');
      expect(text).toContain(`WP07 MIXED SOURCE ${marker}`);
    } finally {
      await doc.destroy();
    }
    await persistPublicSyntheticEvidence(`mixed-export-${actualHash}.pdf`, output);
    await expect(queue).toContainText('Download initiated — receipt unverified');
    await queue.getByRole('button', { name: 'Confirm received' }).first().click();
    if (queueIndex === 0) await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1);
  }
  await expect(queue).toHaveCount(0);
  await persistPublicSyntheticEvidence(
    `mixed-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
  );
  process.stdout.write((`WP07_BATCH_MIXED run=${report.metadata.runId} status=success,failed,success picker_indices=0,1,2 queued=2 saved=2`) + '\n');
});

test('WP07 B03: extracted current-page PDF and working copy are both hashed, queued, saved and receipt-confirmed', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');

  const input = Buffer.from(await createThreePageSource());
  const inputSha256 = createHash('sha256').update(input).digest('hex');
  await persistPublicSyntheticEvidence(`multi-source-${inputSha256}.pdf`, input);
  const initiated: string[] = [];
  page.on('download', (item) => initiated.push(item.suggestedFilename()));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([{ name: 'multi-source.pdf', mimeType: 'application/pdf', buffer: input }]);
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });
  await expect(queue).toContainText('PDF #1 (working-copy)');
  await expect(queue).toContainText('PDF #2 (auxiliary)');
  expect(initiated.filter((name) => name.endsWith('.pdf'))).toEqual([]);

  const [downloadReport] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.json') }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await downloadReport.path() as string, 'utf8')) as {
    metadata: { runId: string; recipeSha256: string };
    summary: { succeeded: number; outputsPrepared: number; outputsHandedOff: number };
    records: Array<{
      inputIndex: number; sourceSha256: string; outputCount: number;
      outputDisposition: string; outputs: Array<{
        outputIndex: number; outputKind: string; outputBytes: number;
        outputName: string; outputSha256: string; outputDisposition: string;
        originalOutputName?: string;
      }>;
    }>;
    evidence: { inputs: Array<{ outputs: unknown[] }> };
  };
  expect(report.summary).toMatchObject({
    succeeded: 1, outputsPrepared: 2, outputsHandedOff: 2,
  });
  expect(report.records[0].sourceSha256).toBe(`sha256:${inputSha256}`);
  expect(report.records[0].outputCount).toBe(2);
  const manifest = report.records[0].outputs;
  expect(manifest.map((o) => [o.outputIndex, o.outputKind])).toEqual([
    [0, 'working-copy'], [1, 'auxiliary'],
  ]);
  expect(manifest[1].originalOutputName).toBe('current-page.pdf');
  expect(new Set(manifest.map((o) => o.outputName)).size).toBe(2);
  expect(manifest.every((o) => o.outputDisposition === 'handoff-completed-unverified')).toBe(true);
  expect(report.evidence.inputs[0].outputs).toHaveLength(2);
  const sourceSequences: string[][] = [];

  for (let i = 0; i < manifest.length; i += 1) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
      queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
    ]);
    const saved = await readFile(await download.path() as string);
    const sha256 = createHash('sha256').update(saved).digest('hex');
    expect(download.suggestedFilename()).toBe(manifest[i].outputName);
    expect(`sha256:${sha256}`).toBe(manifest[i].outputSha256);
    expect(saved.byteLength).toBe(manifest[i].outputBytes);
    const doc = await getDocument({ data: new Uint8Array(saved) }).promise;
    const order: string[] = [];
    try {
      for (let pageno = 1; pageno <= doc.numPages; pageno += 1) {
        const native = await doc.getPage(pageno);
        const content = (await native.getTextContent()).items
          .map((item) => ('str' in item ? item.str : '')).join(' ');
        order.push(content.match(/WP07 NATIVE SOURCE PAGE ([ABC])/)?.[1] ?? 'MISSING');
      }
    } finally {
      await doc.destroy();
    }
    sourceSequences.push(order);
    await persistPublicSyntheticEvidence(`multi-export-${sha256}.pdf`, saved);
    await expect(queue).toContainText('Download initiated — receipt unverified');
    await queue.getByRole('button', { name: 'Confirm received' }).first().click();
  }

  expect(sourceSequences).toEqual([['A', 'B', 'C'], ['A']]);
  await expect(queue).toHaveCount(0);
  await persistPublicSyntheticEvidence(
    `multi-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
  );
  process.stdout.write((`WP07_BATCH_MULTI run=${report.metadata.runId} manifests=2 working=ABC auxiliary=A atomic_queued=true sha256_verified=true receipts_explicit=true`) + '\n');
});

async function readBatchReceipts(page: Page): Promise<Array<{ method: string; outputName: string; outputSha256: string }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pdf-hub-wp07-output-custody-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const receipts = await new Promise<Array<{ method: string; sourceInputIndex: number; sourceOutputIndex: number; outputName: string; outputSha256: string }>>((resolve, reject) => {
        const request = db.transaction('receipts', 'readonly').objectStore('receipts').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return receipts.sort((a, b) =>
        a.sourceInputIndex - b.sourceInputIndex || a.sourceOutputIndex - b.sourceOutputIndex,
      );
    } finally {
      db.close();
    }
  });
}

test('WP07 R4: batch queue and report recover after reload; receipt deletion stays deleted', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  let sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  let batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');
  const input = Buffer.from(await createThreePageSource());
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([{ name: 'restart-test.pdf', mimeType: 'application/pdf', buffer: input }]);
  let queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });
  await expect(batch.getByRole('button', { name: 'Download JSON Report Again' })).toBeVisible();

  const reopenWorkspace = async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Browse Files' }).waitFor();
    const [sourcePicker] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Browse Files' }).click(),
    ]);
    await sourcePicker.setFiles({
      name: 'restart-test.pdf', mimeType: 'application/pdf', buffer: input,
    });
    await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
    const restoredSidebar = page.getByTestId('automate-sidebar');
    await expect(restoredSidebar).toBeVisible();
    return restoredSidebar;
  };

  sidebar = await reopenWorkspace();
  queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 20_000 });
  expect(await queue.textContent()).toContain('PDF #2 (auxiliary)');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  batch = page.getByTestId('automate-batch-run');
  await expect(batch.getByRole('button', { name: 'Download JSON Report Again' })).toBeVisible();
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.json') }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string };
    records: Array<{ outputs: Array<{ outputSha256: string; outputName: string }> }>;
  };
  expect(report.records[0].outputs).toHaveLength(2);

  const [firstDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
    queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
  ]);
  const primary = await readFile(await firstDownload.path() as string);
  expect(`sha256:${createHash('sha256').update(primary).digest('hex')}`)
    .toBe(report.records[0].outputs[0].outputSha256);
  await queue.getByRole('button', { name: 'Confirm received' }).first().click();
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1);
  await expect(queue.getByTestId('batch-receipt-ledger')).toContainText('browser-user-confirmed');
  await persistPublicSyntheticEvidence(
    `recovered-primary-${createHash('sha256').update(primary).digest('hex')}.pdf`, primary,
  );

  await reopenWorkspace();
  queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1, { timeout: 20_000 });
  await expect(queue).toContainText('PDF #2 (auxiliary)');
  expect(await readBatchReceipts(page)).toMatchObject([{
    method: 'browser-user-confirmed',
    outputSha256: report.records[0].outputs[0].outputSha256,
  }]);
  const [secondDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
    queue.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const auxiliary = await readFile(await secondDownload.path() as string);
  expect(`sha256:${createHash('sha256').update(auxiliary).digest('hex')}`)
    .toBe(report.records[0].outputs[1].outputSha256);
  await persistPublicSyntheticEvidence(
    `recovered-auxiliary-${createHash('sha256').update(auxiliary).digest('hex')}.pdf`, auxiliary,
  );
  await queue.getByRole('button', { name: 'Confirm received' }).click();
  await expect(queue).toHaveCount(0);

  await reopenWorkspace();
  await expect(page.getByTestId('macro-output-queue')).toHaveCount(0);
  await expect(page.getByTestId('batch-custody-blocked')).toHaveCount(0);
  const journal = await readBatchReceipts(page);
  expect(journal).toHaveLength(2);
  await expect(page.getByTestId('batch-receipt-ledger')).toContainText('2 durable record(s)');
  expect(journal.map((receipt) => receipt.method)).toEqual([
    'browser-user-confirmed', 'browser-user-confirmed',
  ]);
  expect(journal.map((receipt) => receipt.outputSha256)).toEqual(
    report.records[0].outputs.map((output) => output.outputSha256),
  );
  await persistPublicSyntheticEvidence(
    `recovered-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
  );
  process.stdout.write((`WP07_R4_RECOVERY run=${report.metadata.runId} reloads=3 outputs_restored=2 partial_receipt_retained=true completed_receipts_removed=true`) + '\n');
});

test('WP07 Stage2: Clear requires confirmation and journals every discarded PDF across reload', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  await page.getByTestId('automate-batch-run')
    .getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');
  const source = Buffer.from(await createThreePageSource());
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([{ name: 'discard-source.pdf', mimeType: 'application/pdf', buffer: source }]);

  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });
  await queue.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(queue.getByRole('alert')).toContainText('Discard 2 queued PDF(s)?');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2);
  await queue.getByRole('button', { name: 'Keep PDFs' }).click();
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2);

  await queue.getByRole('button', { name: 'Clear', exact: true }).click();
  await queue.getByRole('button', { name: 'Discard queued PDFs' }).click();
  await expect(page.getByTestId('macro-output-queue')).toHaveCount(0, { timeout: 12_000 });
  const tombstones = await readBatchReceipts(page);
  expect(tombstones).toHaveLength(2);
  await expect(page.getByTestId('batch-receipt-ledger')).toContainText('discarded-without-receipt');
  expect(tombstones.every((record) => record.method === 'discarded-without-receipt')).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Browse Files' }).waitFor();
  const [sourcePicker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await sourcePicker.setFiles({
    name: 'discard-source.pdf', mimeType: 'application/pdf', buffer: source,
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  await expect(page.getByTestId('macro-output-queue')).toHaveCount(0);
  expect(await readBatchReceipts(page)).toEqual(tombstones);
});

test('WP07 R4 FSA: mismatched external file readback leaves durable output queued for retry', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  await page.getByTestId('automate-batch-run')
    .getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');
  const input = Buffer.from(await createThreePageSource());
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([{ name: 'fsa-source.pdf', mimeType: 'application/pdf', buffer: input }]);
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });

  await page.evaluate(() => {
    // Simulates a provider that returns a writable handle but gives corrupt
    // bytes to a subsequent getFile() readback.
    const win = window as unknown as { showSaveFilePicker: () => Promise<unknown> };
    win.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async () => undefined,
        close: async () => undefined,
      }),
      getFile: async () => new File(
        [new Uint8Array([37, 80, 68, 70, 45, 88])],
        'corrupted.pdf',
        { type: 'application/pdf' },
      ),
    });
  });
  await queue.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(queue.getByRole('alert')).toContainText(
    'OUTPUT_EXTERNAL_READBACK_MISMATCH',
    { timeout: 12_000 },
  );
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2);
  await expect(queue).not.toContainText('Download initiated — receipt unverified');

  await page.evaluate(() => {
    // Next attempt writes the entire buffer, closes it, and returns the
    // same native bytes for readback. The queue may acknowledge only then.
    const win = window as unknown as { showSaveFilePicker: () => Promise<unknown> };
    win.showSaveFilePicker = async () => {
      let stored = new Uint8Array(0);
      return {
        createWritable: async () => ({
          write: async (data: ArrayBuffer | Uint8Array) => {
            stored = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data));
          },
          close: async () => undefined,
        }),
        getFile: async () => new File([stored], 'verified.pdf', { type: 'application/pdf' }),
      };
    };
  });
  await queue.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(1, { timeout: 12_000 });
  await expect(queue).toContainText('PDF #2 (auxiliary)');
  process.stdout.write(('WP07_R4_FSA_READBACK corrupted_readback_rejected=true durable_output_retained=true verified_retry_acknowledged=true') + '\n');
});

test('WP07 R5: repository-native engineering PDF corpus with invalid and encrypted inputs', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');

  // These are committed repository-native PDFs. Their original authorship is
  // not independently proven, so this is an engineering fixture challenge,
  // NOT a claim of customer-provided archival corpus acceptance.
  const cases = [
    { name: 'bm2_benchmark_annotated.pdf', bytes: await readFile('../bm2_benchmark_annotated.pdf'), valid: true },
    { name: 'poisoned.pdf', bytes: Buffer.from('%PDF-1.7\\n% malicious but no PDF objects'), valid: false },
    { name: 'navis_tag_isonote_sample_annotated.pdf', bytes: await readFile('../navis_tag_isonote_sample_annotated.pdf'), valid: true },
    { name: 'encrypted-with-images.pdf', bytes: await readFile('fidelity/phase9/retained/encrypted-with-images.pdf'), valid: false },
  ];
  const sourceDigests = cases.map(({ bytes }) => createHash('sha256').update(bytes).digest('hex'));
  // Keep the exact public repository fixture bytes alongside their native
  // descendants so an independent auditor can compare original PDF objects
  // and rendered page appearances instead of trusting producer summaries.
  for (const [index, source] of cases.entries()) {
    await persistPublicSyntheticEvidence(
      `r5-source-${String(index + 1).padStart(2, '0')}-${sourceDigests[index]}.pdf`,
      source.bytes,
    );
  }
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles(cases.map(({ name, bytes }) => ({
    name, mimeType: 'application/pdf', buffer: Buffer.from(bytes),
  })));

  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(4, { timeout: 45_000 });
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.json') }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string };
    summary: { succeeded: number; failed: number; outputsHandedOff: number };
    records: Array<{
      status: string; inputIndex: number; sourceSha256?: string;
      outputs?: Array<{
        outputIndex: number; outputName: string; outputSha256: string;
        outputPageCount: number; outputBytes: number;
      }>;
    }>;
  };
  expect(report.records.map((r) => r.status)).toEqual(['success', 'failed', 'success', 'failed']);
  expect(report.summary).toMatchObject({ succeeded: 2, failed: 2, outputsHandedOff: 4 });
  const inspections: Array<{
    inputIndex: number; sourceDigest: string; sourcePages: number;
    nativePages: number[]; sha256: string[]; sourceFirstAnnotations: number;
    outputFirstAnnotations: number[]; sourceFirstRotation: number; outputFirstRotation: number[];
  }> = [];
  for (const inputIndex of [0, 2]) {
    const item = cases[inputIndex];
    const row = report.records[inputIndex];
    expect(row.sourceSha256).toBe(`sha256:${sourceDigests[inputIndex]}`);
    expect(row.outputs).toHaveLength(2);
    const sourceDoc = await getDocument({ data: new Uint8Array(item.bytes) }).promise;
    const sourceFirst = await sourceDoc.getPage(1);
    const sourceFirstAnnotations = (await sourceFirst.getAnnotations()).length;
    const sourceRotation = sourceFirst.rotate;
    const sourceText = (await sourceFirst.getTextContent()).items
      .map((value) => ('str' in value ? value.str : '')).join(' ').replace(/\\s+/g, '');
    const sourcePages = sourceDoc.numPages;
    const nativePages: number[] = [];
    const nativeDigests: string[] = [];
    const nativeAnnotations: number[] = [];
    const nativeRotation: number[] = [];
    for (let outputIndex = 0; outputIndex < 2; outputIndex += 1) {
      const expected = row.outputs?.[outputIndex];
      expect(expected).toBeTruthy();
      const [download] = await Promise.all([
        page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
        queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
      ]);
      const bytes = await readFile(await download.path() as string);
      const digest = createHash('sha256').update(bytes).digest('hex');
      expect(download.suggestedFilename()).toBe(expected?.outputName);
      expect(`sha256:${digest}`).toBe(expected?.outputSha256);
      expect(bytes.byteLength).toBe(expected?.outputBytes);
      const nativeDoc = await getDocument({ data: new Uint8Array(bytes) }).promise;
      const nativeFirst = await nativeDoc.getPage(1);
      const nativeText = (await nativeFirst.getTextContent()).items
        .map((value) => ('str' in value ? value.str : '')).join(' ').replace(/\\s+/g, '');
      expect(nativeText).toBe(sourceText);
      const numPages = nativeDoc.numPages;
      expect(numPages).toBe(expected?.outputPageCount);
      expect(numPages).toBe(outputIndex === 0 ? sourcePages : 1);
      nativePages.push(numPages);
      nativeDigests.push(digest);
      nativeAnnotations.push((await nativeFirst.getAnnotations()).length);
      nativeRotation.push(nativeFirst.rotate);
      expect(nativeFirst.rotate).toBe(sourceRotation);
      await nativeDoc.destroy();
      await persistPublicSyntheticEvidence(`repo-native-export-${digest}.pdf`, bytes);
      await expect(queue).toContainText('Download initiated — receipt unverified');
      await queue.getByRole('button', { name: 'Confirm received' }).first().click();
    }
    await sourceDoc.destroy();
    inspections.push({
      inputIndex, sourceDigest: sourceDigests[inputIndex], sourcePages,
      nativePages, sha256: nativeDigests,
      sourceFirstAnnotations, outputFirstAnnotations: nativeAnnotations,
      sourceFirstRotation: sourceRotation, outputFirstRotation: nativeRotation,
    });
  }
  await expect(queue).toHaveCount(0);
  await persistPublicSyntheticEvidence(
    `repo-native-corpus-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify({
      provenance: 'PUBLIC_REPOSITORY_FIXTURE__ORIGINAL_AUTHORSHIP_NOT_VERIFIED',
      report, inspections,
      sourceDigests: cases.map((item, i) => ({
        name: item.name, sha256: sourceDigests[i], expectedValid: item.valid,
      })),
    }, null, 2)),
  );
  process.stdout.write(('WP07_R5_REPO_CORPUS valid=2 rejected=2 generated=4 SHA_verified=true native_pdf_page_counts_verified=true rotations_verified=true') + '\n');
});

test('WP07 R5: cancellation during input read preserves prior native PDFs and never processes the next input', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');
  const original = Buffer.from(await createThreePageSource());
  await page.evaluate(() => {
    const win = window as Window & { __wp07SlowReadStarted?: boolean; __wp07LaterReadStarted?: boolean };
    const originalRead = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name === 'slow-read.pdf') {
        win.__wp07SlowReadStarted = true;
        return new Promise<ArrayBuffer>(() => undefined);
      }
      if (this.name === 'later-unread.pdf') win.__wp07LaterReadStarted = true;
      return originalRead.call(this);
    };
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([
    { name: 'completed-first.pdf', mimeType: 'application/pdf', buffer: original },
    { name: 'slow-read.pdf', mimeType: 'application/pdf', buffer: original },
    { name: 'later-unread.pdf', mimeType: 'application/pdf', buffer: original },
  ]);
  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });
  await page.waitForFunction(() =>
    (window as Window & { __wp07SlowReadStarted?: boolean }).__wp07SlowReadStarted === true,
  );
  await batch.getByRole('button', { name: 'Cancel Batch' }).click();
  await expect(batch.getByRole('button', { name: 'Choose Workflow' })).toBeVisible({ timeout: 12_000 });
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2);
  expect(await page.evaluate(() =>
    (window as Window & { __wp07LaterReadStarted?: boolean }).__wp07LaterReadStarted ?? false,
  )).toBe(false);
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.json') }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string };
    cancelled: boolean;
    records: Array<{ status: string; inputIndex: number; outputs?: Array<{ outputName: string }> }>;
  };
  expect(report.cancelled).toBe(true);
  expect(report.records.map((row) => row.status)).toEqual(['success', 'cancelled', 'not-run']);
  expect(report.records[0].outputs).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  const [sourcePicker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await sourcePicker.setFiles({
    name: 'reload-after-cancel.pdf', mimeType: 'application/pdf', buffer: original,
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  await expect(page.getByTestId('macro-output-queue')
    .getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 20_000 });
  await persistPublicSyntheticEvidence(
    `cancel-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify(report, null, 2)),
  );
  process.stdout.write(('WP07_R5_CANCEL first_outputs=2 cancelled_input=1 later_unread=true reload_retained=2') + '\n');
});

test('WP07 R5: native rotated annotations survive batch extraction in both primary and auxiliary PDFs', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await page.locator('[data-macro-builder="true"]')
    .getByRole('button', { name: 'Close', exact: true }).click();
  const sidebar = page.getByTestId('automate-sidebar');
  await sidebar.getByRole('button', { name: 'Quick Actions' }).click();
  const batch = page.getByTestId('automate-batch-run');
  await batch.getByRole('button', { name: 'Choose Workflow' }).click();
  await page.getByLabel('Batch workflow').selectOption('batch-extract-current');

  const source = Buffer.from(await createR5RotatedAnnotatedSource());
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  await persistPublicSyntheticEvidence(`r5-rotated-native-source-${sourceSha256}.pdf`, source);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose PDFs & Run' }).click(),
  ]);
  await chooser.setFiles([{ name: 'rotated-note.pdf', mimeType: 'application/pdf', buffer: source }]);

  const queue = page.getByTestId('macro-output-queue');
  await expect(queue.getByTestId('batch-output-provenance')).toHaveCount(2, { timeout: 30_000 });
  const [reportDownload] = await Promise.all([
    page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.json') }),
    batch.getByRole('button', { name: 'Download JSON Report Again' }).click(),
  ]);
  const report = JSON.parse(await readFile(await reportDownload.path() as string, 'utf8')) as {
    metadata: { runId: string };
    records: Array<{ status: string; sourceSha256: string; outputs: Array<{
      outputIndex: number; outputSha256: string; outputName: string; outputPageCount: number;
    }> }>;
  };
  expect(report.records[0].status).toBe('success');
  expect(report.records[0].sourceSha256).toBe(`sha256:${sourceSha256}`);
  expect(report.records[0].outputs.map((o) => o.outputPageCount)).toEqual([3, 1]);

  const readNativeNote = async (raw: Uint8Array): Promise<{
    pages: number; rotation: number; noteText: string; noteId: string; rect: string;
  }> => {
    const pdf = await PDFDocument.load(raw);
    const owner = pdf.getPage(0);
    const notes = owner.node.lookup(PDFName.of('Annots'), PDFArray);
    expect(notes.size()).toBe(1);
    const native = notes.lookup(0, PDFDict);
    const readString = (key: string) => native.lookup(PDFName.of(key), PDFString).decodeText();
    return {
      pages: pdf.getPageCount(),
      rotation: owner.getRotation().angle,
      noteText: readString('Contents'),
      noteId: readString('NM'),
      rect: native.lookup(PDFName.of('Rect'), PDFArray).toString(),
    };
  };
  const before = await readNativeNote(new Uint8Array(source));
  expect(before).toMatchObject({
    pages: 3, rotation: 90,
    noteText: 'R5 owner note remains on source page A',
    noteId: 'WP07-R5-AUTHORITATIVE-NOTE',
  });
  const nativeOutputs: Array<ReturnType<typeof readNativeNote> extends Promise<infer T> ? T : never> = [];
  for (const [index, manifest] of report.records[0].outputs.entries()) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.pdf') }),
      queue.getByRole('button', { name: 'Save', exact: true }).first().click(),
    ]);
    const bytes = await readFile(await download.path() as string);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(`sha256:${digest}`).toBe(manifest.outputSha256);
    expect(download.suggestedFilename()).toBe(manifest.outputName);
    const after = await readNativeNote(new Uint8Array(bytes));
    expect(after).toEqual({
      ...before, pages: index === 0 ? 3 : 1,
    });
    const pdfjs = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const pageOne = await pdfjs.getPage(1);
    expect(pageOne.rotate).toBe(90);
    expect((await pageOne.getAnnotations()).length).toBe(1);
    await pdfjs.destroy();
    nativeOutputs.push(after);
    await persistPublicSyntheticEvidence(`r5-rotated-native-export-${digest}.pdf`, bytes);
    await queue.getByRole('button', { name: 'Confirm received' }).first().click();
  }
  await expect(queue).toHaveCount(0);
  await persistPublicSyntheticEvidence(
    `r5-rotated-native-report-${report.metadata.runId}.json`,
    Buffer.from(JSON.stringify({ report, sourceSha256, before, nativeOutputs }, null, 2)),
  );
  process.stdout.write(('WP07_R5_ROTATED_NATIVE source=ABC output=ABC,A rotation=90 note_identity=true native_annotation=1 each_output=true') + '\n');
});
