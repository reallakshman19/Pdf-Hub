import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { persistWp05SyntheticEvidence } from './fixtures/wp05Evidence';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Generate two raster-only pages using Chromium, followed by one page with
 * native text. No recognition result or engine is mocked.
 */
async function createOcrSource(page: Page): Promise<Uint8Array> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1200);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('ALPHA VALVE 10 BAR', 90, 170);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Buffer.from(base64, 'base64'));
  for (let index = 0; index < 2; index += 1) {
    const scannedPage = pdf.addPage([500, 600]);
    scannedPage.drawImage(image, { x: 0, y: 0, width: 500, height: 600 });
  }
  const native = pdf.addPage([500, 600]);
  native.drawText('NATIVE REVIEW SOURCE', { x: 40, y: 520, size: 12 });
  native.drawText('This sparse page is already searchable.', { x: 40, y: 500, size: 9 });
  return new Uint8Array(await pdf.save());
}

async function readRecognizedWordsFromEditableProject(page: Page): Promise<string[][]> {
  // Public product export is the independent witness of OCR transcription.
  // This synthetic PDF contains no customer information and the exported
  // artifact is used only for browser certification.
  await page.getByRole('tab', { name: 'Write' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Save Project' }).click({ timeout: 10_000 }),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('OCR project did not return downloadable ZIP bytes');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const zipBytes = Buffer.concat(chunks);
  await persistWp05SyntheticEvidence('wp05-synthetic-tesseract-project.pdfhub.zip', zipBytes);
  await test.info().attach('wp05-synthetic-tesseract-project.pdfhub.zip', {
    body: zipBytes,
    contentType: 'application/zip',
  });
  const zip = await JSZip.loadAsync(zipBytes);
  const manifestFile = zip.file('ocr/manifest.json');
  const file = zip.file('ocr/result.json');
  if (!file || !manifestFile) {
    throw new Error('Editable project ZIP omits OCR payload members after real recognition');
  }
  const manifest: unknown = JSON.parse(await manifestFile.async('text'));
  const parsed: unknown = JSON.parse(await file.async('text'));
  const result = parsed as { pages?: Array<{ words?: Array<{ text?: string }> }> } | null;
  process.stdout.write('WP05_REAL_OCR_ARCHIVE_PAYLOAD ' + JSON.stringify({
    source: 'native product ZIP',
    hasResult: result !== null,
    pageCount: result?.pages?.length ?? 0,
    wordsPerPage: result?.pages?.map((item) => item.words?.length ?? 0) ?? [],
    counts: (manifest as { counts?: unknown }).counts ?? null,
  }) + '\n');
  if (!result || !Array.isArray(result.pages)) {
    throw new Error('Real OCR run did not retain its page result in native project ZIP');
  }
  return result.pages.map((item) =>
    (item.words ?? []).map((word) => word.text ?? ''),
  );
}

test('P01: real Tesseract.js defaults to all scan pages and exports searchable PDF text', async ({ page }) => {
  test.setTimeout(180_000);
  const source = await createOcrSource(page);
  await persistWp05SyntheticEvidence('wp05-synthetic-tesseract-input.pdf', Buffer.from(source));
  await test.info().attach('wp05-synthetic-tesseract-input.pdf', {
    body: Buffer.from(source),
    contentType: 'application/pdf',
  });
  // The first two pages are raster scans. The last has an existing native text layer.
  const sourcePdf = await PDFDocument.load(source);
  expect(sourcePdf.getPageCount()).toBe(3);
  const pageContents = sourcePdf.getPage(0).node.Contents();
  expect(pageContents).toBeDefined();

  await stubNativeFilePickers(page);
  await page.goto('./');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'wp05-real-scan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(source),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await expect(page.getByRole('radio', { name: /all/i })).toBeChecked();
  await expect(page.getByTestId('ocr-run-controls')).toContainText('Tesseract.js OCR');

  const run = page.getByTestId('run-ocr-button');
  await expect(run).toBeEnabled();
  await run.click();
  // The review shell can appear before the async Tesseract worker finishes.
  // Only the completed workflow and a nonzero source-word count authorize
  // export/search assertions; otherwise the test reads a transient empty job.
  await expect(page.getByTestId('ocr-run-status')).toContainText('OCR complete.', {
    timeout: 150_000,
  });
  const review = page.getByTestId('ocr-review-workspace');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('ocr-result-summary')).toContainText(/Words\s*[1-9][0-9]*/, {
    timeout: 10_000,
  });
  const summaryBeforeExport = await page.getByTestId('ocr-result-summary').textContent();
  process.stdout.write(`WP05_REAL_OCR_UI_SUMMARY_BEFORE_PROJECT_EXPORT ${summaryBeforeExport}\n`);
  const transcribed = await readRecognizedWordsFromEditableProject(page);
  process.stdout.write(`WP05_REAL_OCR_TRANSCRIBED_WORDS ${JSON.stringify(transcribed)}\n`);
  expect(transcribed).toHaveLength(3);
  for (const words of transcribed.slice(0, 2)) {
    expect(words.join(' ')).toMatch(/ALPHA\s+VALVE\s+10\s+BAR/i);
  }
  expect(transcribed[2].join(' ')).toContain('NATIVE REVIEW SOURCE');
  const search = page.getByPlaceholder('Search OCR result');
  // Capture real recognized words through the public search interface.
  // Diagnostics distinguish recognition errors from a broken index/UI.
  const probes: Record<string, string[]> = {};
  for (const query of ['a', 'ALPHA', 'VALVE', '10', 'BAR']) {
    await search.fill(query);
    await expect.poll(async () => page.getByTestId('ocr-search-mini-panel').count()).toBe(1);
    probes[query] = await page.getByTestId('ocr-search-match').allTextContents();
  }
  process.stdout.write(`WP05_REAL_OCR_SEARCH_PROBES ${JSON.stringify(probes)}\n`);
  expect(probes.ALPHA.some((value) => /ALPHA/i.test(value)), 'independent scanned source must yield searchable ALPHA').toBe(true);
  expect(probes.VALVE.some((value) => /VALVE/i.test(value)), 'independent scanned source must yield searchable VALVE').toBe(true);

  await page.getByTestId('ocr-searchable-pdf-export-button').click();
  await expect(page.getByTestId('ocr-searchable-pdf-message')).toContainText('Searchable PDF created: 8 OCR text item(s), 0 skipped.', { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('ocr-searchable-pdf-download-button').click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Searchable PDF download did not return bytes');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const searchableBytes = Buffer.concat(chunks);
  await persistWp05SyntheticEvidence('wp05-synthetic-tesseract-searchable.pdf', searchableBytes);
  const native = await getDocument({ data: new Uint8Array(searchableBytes) }).promise;
  try {
    expect(native.numPages).toBe(3);
    for (const pageNumber of [1, 2]) {
      const outputPage = await native.getPage(pageNumber);
      const content = await outputPage.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      expect(text).toMatch(/ALPHA\s+VALVE\s+10\s+BAR/i);
    }
    const nativeText = (await (await native.getPage(3)).getTextContent()).items
      .map((item) => 'str' in item ? item.str : '').join(' ');
    expect(nativeText.match(/NATIVE\s+REVIEW\s+SOURCE/g)).toHaveLength(1);
  } finally {
    await native.destroy();
  }
});
