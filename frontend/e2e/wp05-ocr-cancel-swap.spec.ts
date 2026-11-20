import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { persistWp05SyntheticEvidence } from './fixtures/wp05Evidence';

test.use({ viewport: { width: 1440, height: 900 } });

async function scannedDocument(page: Page, phrase: string, pageCount: number) {
  const encoded = await page.evaluate((text) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No Canvas 2D');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 50, 175);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, phrase);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(Buffer.from(encoded, 'base64'));
  for (let index = 0; index < pageCount; index += 1) {
    doc.addPage([500, 610]).drawImage(image, {
      x: 0, y: 0, width: 500, height: 610,
    });
  }
  return new Uint8Array(await doc.save());
}

async function admit(page: Page, bytes: Uint8Array, name: string, first = false) {
  if (first) {
    await stubNativeFilePickers(page);
    await page.goto('./');
  } else {
    await page.getByRole('tab', { name: 'File' }).click();
  }
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    first
      ? page.getByRole('button', { name: 'Browse Files' }).click()
      : page.getByRole('button', { name: 'Open PDF' }).click(),
  ]);
  await picker.setFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });
}

async function runTesseract(page: Page) {
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  const details = page.getByTestId('ocr-run-advanced-settings');
  await details.locator('summary').click();
  await page.getByTestId('ocr-engine-select').selectOption('tesseract-js');
  await page.getByTestId('run-ocr-button').click();
  await expect(page.getByTestId('cancel-ocr-button')).toBeVisible({ timeout: 20_000 });
}

async function exportZip(page: Page) {
  await page.getByRole('tab', { name: 'Write' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25_000 }),
    page.getByRole('button', { name: 'Save Project' }).click({ timeout: 10_000 }),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('No project ZIP bytes');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return JSZip.loadAsync(Buffer.concat(chunks));
}

test('P06-CANCEL: user Cancel aborts an in-flight real Tesseract job without late completion', async ({ page }) => {
  test.setTimeout(120_000);
  const original = await scannedDocument(page, 'ALPHA VALVE 10 BAR', 12);
  await admit(page, original, 'wp05-inflight-cancel.pdf', true);
  await runTesseract(page);
  await page.getByTestId('cancel-ocr-button').click();
  await expect(page.getByTestId('run-ocr-button')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByText('OCR job cancelled.').first()).toBeVisible();
  // Give the old worker enough time to attempt a late callback.
  await page.waitForTimeout(2500);
  await expect(page.getByText('OCR job cancelled.').first()).toBeVisible();
  // Completed-state status is deliberately unmounted after cancellation.
  await expect(page.getByTestId('ocr-run-status')).toHaveCount(0);
});

test('P06-SWAP: replacing the document during real OCR never publishes old words into the new project', async ({ page }) => {
  test.setTimeout(120_000);
  const oldSource = await scannedDocument(page, 'ALPHA VALVE 10 BAR', 12);
  const newSource = await scannedDocument(page, 'BETA COMPRESSOR 25 PSI', 1);
  await persistWp05SyntheticEvidence('wp05-synthetic-swap-source-a.pdf', oldSource);
  await persistWp05SyntheticEvidence('wp05-synthetic-swap-source-b.pdf', newSource);
  await admit(page, oldSource, 'wp05-inflight-old.pdf', true);
  await runTesseract(page);
  await admit(page, newSource, 'wp05-inflight-new.pdf');

  // The old run must not contaminate B, but B must also recognize its own text.
  // The deferred-engine barrier negative control remains a separate pending test.
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  const settings = page.getByTestId('ocr-run-advanced-settings');
  if ((await settings.getAttribute('open')) === null) {
    await settings.locator('summary').click();
  }
  await page.getByTestId('ocr-engine-select').selectOption('tesseract-js');
  await expect(page.getByTestId('run-ocr-button')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('run-ocr-button').click();
  await expect(page.getByTestId('ocr-run-status')).toContainText('OCR complete.', { timeout: 90_000 });
  const zip = await exportZip(page);
  const sourceFile = zip.file('original.pdf');
  expect(sourceFile).toBeTruthy();
  const savedSource = new Uint8Array(await sourceFile!.async('uint8array'));
  expect(Buffer.from(savedSource)).toEqual(Buffer.from(newSource));

  const payloadFile = zip.file('ocr/result.json');
  const result = payloadFile
    ? JSON.parse(await payloadFile.async('text')) as {
        pages?: Array<{ words?: Array<{ text?: string }> }>;
      } | null
    : null;
  const terms = (result?.pages ?? []).flatMap((p) => (p.words ?? []).map((w) => w.text ?? ''));
  process.stdout.write(`WP05_P06_SWAP_NEW_PROJECT_TERMS ${JSON.stringify(terms)}\n`);
  expect(terms.join(' ')).toMatch(/BETA\s+COMPRESSOR\s+25\s+PSI/i);
  expect(terms.join(' ')).not.toMatch(/ALPHA|VALVE/i);
});
