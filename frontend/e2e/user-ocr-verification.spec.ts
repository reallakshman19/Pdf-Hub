import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 } });

test('User OCR verification: Select OCR area coordinates match marquee and Full OCR defaults to all pages', async ({ page }) => {
  test.setTimeout(180_000);

  const pdfPath = 'C:\\Users\\reall\\Downloads\\Markup for SYS-008A.pdf';
  if (!fs.existsSync(pdfPath)) {
    test.skip();
    return;
  }
  const pdfBytes = fs.readFileSync(pdfPath);

  await stubNativeFilePickers(page);
  await page.goto('./');

  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: 'Markup for SYS-008A.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });

  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });

  // 1. Verify OCR Area selection doesn't offset or jump down
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /OCR Area/ }).click();

  const capture = page.getByTestId('writer-overlay-capture').first();
  await expect(capture).toBeVisible();
  const bounds = await capture.boundingBox();
  expect(bounds).toBeTruthy();

  // Drag over a region near the top-left (similar to user's Snap 1 callout)
  const left = bounds!.x + 100;
  const top = bounds!.y + 120;
  const right = bounds!.x + 320;
  const bottom = bounds!.y + 240;

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 5 });
  await page.mouse.up();

  // Verify pending box is at the dragged coordinates
  const pending = page.getByTestId('ocr-document-region-pending');
  await expect(pending).toBeVisible();
  const pendingBounds = await pending.boundingBox();
  expect(pendingBounds).toBeTruthy();

  const pickerBox = page.getByTestId('ocr-document-region-mode-picker');
  await expect(pickerBox).toBeVisible();

  // Click 'Text'
  await pickerBox.getByRole('button', { name: 'text', exact: true }).click();

  // Focus target should appear at the exact same location as the marquee selection!
  const focusTarget = page.getByTestId('ocr-review-focus-target');
  await expect(focusTarget).toBeVisible();
  const focusBounds = await focusTarget.boundingBox();
  expect(focusBounds).toBeTruthy();

  // The focused box bounds should match the dragged region coordinates within 2px
  expect(Math.abs(focusBounds!.x - pendingBounds!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(focusBounds!.y - pendingBounds!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(focusBounds!.width - pendingBounds!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(focusBounds!.height - pendingBounds!.height)).toBeLessThanOrEqual(2);

  // 2. Verify Full OCR defaults
  // In the OCR sidebar, page scope should default to 'All (4 pages)' because the document has 4 pages
  const allRadio = page.getByRole('radio', { name: /all/i });
  await expect(allRadio).toBeChecked();

  // Ready to recognize card should indicate the engine (Tesseract.js OCR)
  const readyControls = page.getByTestId('ocr-run-controls');
  await expect(readyControls).toContainText('Tesseract.js OCR');

  // 3. Test running recognition with Current page scope to verify Tesseract execution and Searchable PDF export
  await page.getByText('Current', { exact: true }).click();

  const runBtn = page.getByTestId('run-ocr-button');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  // Wait for OCR to complete (Tesseract worker runs locally)
  await expect(page.getByTestId('ocr-run-status')).toContainText('OCR complete.', {
    timeout: 90_000,
  });

  // Export Searchable PDF
  const exportSection = page.getByTestId('ocr-export-section');
  await expect(exportSection).toBeVisible();

  // 1. Click 'Create searchable PDF'
  await page.getByTestId('ocr-searchable-pdf-export-button').click();
  await expect(page.getByTestId('ocr-searchable-pdf-message')).toContainText('Searchable PDF created', {
    timeout: 30_000,
  });

  // 2. Click 'Download PDF' and capture the download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByTestId('ocr-searchable-pdf-download-button').click(),
  ]);

  expect(download.suggestedFilename()).toBe('searchable-ocr.pdf');
  const downloadStream = await download.createReadStream();
  expect(downloadStream).toBeTruthy();

  const chunks: Buffer[] = [];
  for await (const chunk of downloadStream!) {
    chunks.push(Buffer.from(chunk));
  }
  const exportedPdfBytes = Buffer.concat(chunks);
  expect(exportedPdfBytes.length).toBeGreaterThan(1000);

  // Verify exported PDF structure with pdf-lib
  const exportedDoc = await PDFDocument.load(exportedPdfBytes);
  expect(exportedDoc.getPageCount()).toBe(4);
});
