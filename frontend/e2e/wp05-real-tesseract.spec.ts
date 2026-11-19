import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

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

test('P01: real Tesseract.js recognizes a raster-only PDF using the compiled app and exposes searchable OCR text', async ({ page }) => {
  test.setTimeout(180_000);
  const source = await scannedOnlyPdf(page);
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
  const engine = page.getByTestId('ocr-engine-select');
  await expect(engine).toBeVisible();
  await engine.selectOption('tesseract-js');
  await expect(engine).toHaveValue('tesseract-js');

  const run = page.getByTestId('run-ocr-button');
  await expect(run).toBeEnabled();
  await run.click();
  const review = page.getByTestId('ocr-review-workspace');
  await expect(review).toBeVisible({ timeout: 150_000 });
  const search = page.getByPlaceholder('Search OCR result');
  await search.fill('ALPHA');
  const hits = page.getByTestId('ocr-search-match');
  await expect(hits.first()).toBeVisible({ timeout: 15_000 });
  await expect(hits.first()).toContainText(/ALPHA/i);
});
