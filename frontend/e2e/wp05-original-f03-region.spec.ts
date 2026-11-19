import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { persistWp05SyntheticEvidence } from './fixtures/wp05Evidence';

test.use({ viewport: { width: 1440, height: 900 } });

const expectedSha = '658b6536b8edc10931744bd75707155a0e731666c04c6ff46e8591d016f258f7';
const fixturePath = path.join(process.cwd(), 'e2e/fixtures/wp05-source-f01-f08/F03-scan-only.pdf');

test('P01-F03: authentic fixture OCR Area uses real Tesseract and decodes exact source phrase', async ({ page }) => {
  test.setTimeout(150_000);
  const bytes = await fs.readFile(fixturePath);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedSha);
  const source = await PDFDocument.load(bytes);
  expect(source.getPageCount()).toBe(1);
  await persistWp05SyntheticEvidence('wp05-f03-authentic-source.pdf', bytes);

  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: 'F03-scan-only.pdf', mimeType: 'application/pdf', buffer: bytes,
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByTestId('ocr-run-advanced-settings').locator('summary').click();
  await page.getByTestId('ocr-engine-select').selectOption('tesseract-js');
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /OCR Area/ }).click();

  // The supplied F03 scan contains the phrase at raster x=140, y=250.
  // Rectangle ratios intentionally cover its second printed line, not
  // the first. This is a real mouse gesture on the compiled PDF.js viewport.
  const capture = page.getByTestId('writer-overlay-capture').first();
  await expect(capture).toBeVisible();
  const bounds = await capture.boundingBox();
  if (!bounds) throw new Error('No actual OCR Area viewport box');
  await page.mouse.move(bounds.x + bounds.width * 0.10, bounds.y + bounds.height * 0.135);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.87, bounds.y + bounds.height * 0.222, { steps: 7 });
  await page.mouse.up();

  const mode = page.getByTestId('ocr-document-region-mode-picker');
  await expect(mode).toBeVisible();
  await mode.getByRole('button', { name: 'text', exact: true }).click();
  await expect(page.getByTestId('ocr-region-row')).toHaveCount(1);
  await page.getByTestId('ocr-region-select').click();
  const run = page.getByTestId('ocr-region-run');
  await expect(run).toBeEnabled({ timeout: 10_000 });
  const start = performance.now();
  await run.click();
  await expect(page.getByTestId('ocr-region-action-message')).toContainText('Region OCR completed.', {
    timeout: 90_000,
  });
  const elapsed = performance.now() - start;
  const recognized = (await page.getByTestId('ocr-region-result-preview').textContent()) ?? '';
  process.stdout.write('WP05_ORIGINAL_F03_REGION ' + JSON.stringify({
    source_sha256: expectedSha,
    engine: 'tesseract-js',
    elapsed_ms: Math.round(elapsed),
    recognized,
  }) + '\n');
  expect(recognized).toMatch(/ALPHA\s+VALVE\s+10\s+BAR/i);
});
