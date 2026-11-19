import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { jumpToPhase8gPage } from './phase8gBrowserBenchmarkSupport';

test.use({ viewport: { width: 1440, height: 900 } });

const F02_SHA256 = 'e9a40be14d253dd6916ff0d6a8ecbf1ccb36c4ca51452b98cddf6e345b812ddd';
const FIXTURE = path.join(process.cwd(), 'e2e/fixtures/wp05-source-f01-f08/F02-rotated-2p.pdf');

test('P05 F02: rotated source page 2 OCR Area recognizes ANCHOR from the real raster crop', async ({ page }) => {
  test.setTimeout(150_000);
  const bytes = await fs.readFile(FIXTURE);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(F02_SHA256);
  const native = await PDFDocument.load(bytes);
  expect(native.getPageCount()).toBe(2);
  expect(native.getPage(1).getRotation().angle).toBe(90);

  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: 'F02-rotated-2p.pdf', mimeType: 'application/pdf', buffer: bytes,
  });
  await jumpToPhase8gPage(page, 2);
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByTestId('ocr-run-advanced-settings').locator('summary').click();
  await page.getByTestId('ocr-engine-select').selectOption('tesseract-js');
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /OCR Area/ }).click();

  const capture = page.getByTestId('writer-overlay-capture').first();
  await expect(capture).toBeVisible();
  const box = await capture.boundingBox();
  if (!box) throw new Error('Rotated F02 page has no selectable OCR viewport');

  // Independent native-PDF + rendered-image observation: ANCHOR on F02 p2
  // is enclosed by this slender region in the rotated portrait viewport.
  // This is deliberately not an entire-page OCR or author-supplied transcript.
  await page.mouse.move(box.x + box.width * 0.565, box.y + box.height * 0.082);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.708, box.y + box.height * 0.296, { steps: 8 });
  await page.mouse.up();
  const mode = page.getByTestId('ocr-document-region-mode-picker');
  await expect(mode).toBeVisible();
  await mode.getByRole('button', { name: 'text', exact: true }).click();
  await expect(page.getByTestId('ocr-region-row')).toHaveCount(1);
  await page.getByTestId('ocr-region-select').click();
  await expect(page.getByTestId('ocr-region-run')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('ocr-region-run').click();
  await expect(page.getByTestId('ocr-region-action-message')).toContainText('Region OCR completed.', { timeout: 100_000 });
  const recognized = (await page.getByTestId('ocr-region-result-preview').textContent()) ?? '';
  process.stdout.write('WP05_F02_ROTATED_P05 ' + JSON.stringify({
    source_sha256: F02_SHA256, physical_page: 2, native_rotate: 90,
    engine: 'tesseract-js', recognized,
  }) + '\n');
  await test.info().attach('F02-p2-rotated-ocr-area.png', {
    body: await page.screenshot(), contentType: 'image/png',
  });
  expect(recognized).toMatch(/ANCHOR/i);
});
