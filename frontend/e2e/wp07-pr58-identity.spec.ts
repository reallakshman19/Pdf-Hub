import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
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
  console.log(`ALT_WP07_SOURCE sha256=${sourceSha256} pages=3`);
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
  console.log(`ALT_WP07_EXPORT sha256=${outputSha256} pages=${markers.length} source_order=${markers.join(',')}`);
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
  console.log(`WP07_OUTPUT_CUSTODY sha256=${digest} queued_before_confirm=true pages=1`);
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
    console.log(`WP07_ANNOTATION_OWNER sha256=${sha256} order=${order.join(',')} notes=${annotations.join(',')}`);
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
  console.log(`WP07_BATCH_PROVENANCE run=${report.metadata.runId} inputs=2 queued=2 independent_outputs=2 sha256_verified=true receipts_explicit=true`);
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
  console.log(`WP07_BATCH_MIXED run=${report.metadata.runId} status=success,failed,success picker_indices=0,1,2 queued=2 saved=2`);
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
  console.log(`WP07_BATCH_MULTI run=${report.metadata.runId} manifests=2 working=ABC auxiliary=A atomic_queued=true sha256_verified=true receipts_explicit=true`);
});
