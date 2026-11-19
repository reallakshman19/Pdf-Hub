import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { persistWp05SyntheticEvidence } from './fixtures/wp05Evidence';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Generate a genuine scanned-only PDF: the recognized phrase is raster pixels
 * drawn by Chromium, then embedded into a PDF. There is intentionally no
 * extractable PDF text. No recognition result or engine is mocked.
 */
async function scannedOnlyPdf(page: Page): Promise<Uint8Array> {
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
  const p = pdf.addPage([500, 600]);
  p.drawImage(image, { x: 0, y: 0, width: 500, height: 600 });
  return new Uint8Array(await pdf.save());
}

async function readRecognizedWordsFromEditableProject(page: Page): Promise<string[]> {
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
  console.log('WP05_REAL_OCR_ARCHIVE_PAYLOAD', JSON.stringify({
    source: 'native product ZIP',
    hasResult: result !== null,
    pageCount: result?.pages?.length ?? 0,
    wordsPerPage: result?.pages?.map((item) => item.words?.length ?? 0) ?? [],
    counts: (manifest as { counts?: unknown }).counts ?? null,
  }));
  if (!result || !Array.isArray(result.pages)) {
    throw new Error('Real OCR run did not retain its page result in native project ZIP');
  }
  return result.pages.flatMap((item) =>
    (item.words ?? []).map((word) => word.text ?? ''),
  );
}

test('P01: real Tesseract.js recognizes a raster-only PDF using the compiled app and exposes searchable OCR text', async ({ page }) => {
  test.setTimeout(180_000);
  const source = await scannedOnlyPdf(page);
  await persistWp05SyntheticEvidence('wp05-synthetic-tesseract-input.pdf', Buffer.from(source));
  await test.info().attach('wp05-synthetic-tesseract-input.pdf', {
    body: Buffer.from(source),
    contentType: 'application/pdf',
  });
  // Verify the source itself is genuinely image-only, not vector text.
  const sourcePdf = await PDFDocument.load(source);
  expect(sourcePdf.getPageCount()).toBe(1);
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
  // Engine is deliberately inside a collapsed native details control.
  await page.getByTestId('ocr-run-advanced-settings').locator('summary').click();
  const engine = page.getByTestId('ocr-engine-select');
  await expect(engine).toBeVisible();
  await engine.selectOption('tesseract-js');
  await expect(engine).toHaveValue('tesseract-js');

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
  console.log('WP05_REAL_OCR_UI_SUMMARY_BEFORE_PROJECT_EXPORT', summaryBeforeExport);
  const transcribed = await readRecognizedWordsFromEditableProject(page);
  console.log('WP05_REAL_OCR_TRANSCRIBED_WORDS', JSON.stringify(transcribed));
  expect(transcribed.some((word) => /ALPHA/i.test(word)), 'Tesseract must decode the synthetic ALPHA pixels').toBe(true);
  expect(transcribed.some((word) => /VALVE/i.test(word)), 'Tesseract must decode the synthetic VALVE pixels').toBe(true);
  const search = page.getByPlaceholder('Search OCR result');
  // Capture real recognized words through the public search interface.
  // Diagnostics distinguish recognition errors from a broken index/UI.
  const probes: Record<string, string[]> = {};
  for (const query of ['a', 'ALPHA', 'VALVE', '10', 'BAR']) {
    await search.fill(query);
    await expect.poll(async () => page.getByTestId('ocr-search-mini-panel').count()).toBe(1);
    probes[query] = await page.getByTestId('ocr-search-match').allTextContents();
  }
  console.log('WP05_REAL_OCR_SEARCH_PROBES', JSON.stringify(probes));
  expect(probes.ALPHA.some((value) => /ALPHA/i.test(value)), 'independent scanned source must yield searchable ALPHA').toBe(true);
  expect(probes.VALVE.some((value) => /VALVE/i.test(value)), 'independent scanned source must yield searchable VALVE').toBe(true);
});
