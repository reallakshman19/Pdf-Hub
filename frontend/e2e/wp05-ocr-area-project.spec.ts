import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument, degrees } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { persistWp05SyntheticEvidence } from './fixtures/wp05Evidence';

test.use({ viewport: { width: 1440, height: 900 } });

async function rotatedCropBoxPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([540, 720]);
  page.setCropBox(70, 100, 470, 520);
  page.setRotation(degrees(90));
  return new Uint8Array(await doc.save());
}

async function openSourcePdf(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: 'wp05-rotated-cropbox.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
}

async function saveProject(page: Page) {
  await page.getByRole('tab', { name: 'Write' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25_000 }),
    page.getByRole('button', { name: 'Save Project' }).click({ timeout: 10_000 }),
  ]).catch(async (error: unknown) => {
    const alerts = await page.getByRole('alert').allTextContents();
    const visibleStatus = await page.getByTestId('status-bar').allTextContents();
    throw new Error(`Save Project did not create a browser download: ${String(error)}; alerts=${JSON.stringify(alerts)}; status=${JSON.stringify(visibleStatus)}`);
  });
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Project ZIP download stream unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return Buffer.concat(chunks);
}

interface SavedRegion {
  id: string;
  documentFingerprint: string;
  pageId?: string;
  pageIndex: number;
  bbox: { x: number; y: number; width: number; height: number };
  geometryProvenance?: string;
}

async function readRegions(bytes: Buffer): Promise<SavedRegion[]> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('ocr/regions.json');
  expect(entry, 'project must preserve OCR region file').toBeTruthy();
  const regions: unknown = JSON.parse(await entry!.async('text'));
  expect(Array.isArray(regions)).toBe(true);
  return regions as SavedRegion[];
}

test('P05: document OCR Area on a real rotated CropBox page survives two editable-project reopen cycles', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const source = await rotatedCropBoxPdf();
  await persistWp05SyntheticEvidence('wp05-synthetic-rotated-cropbox-source.pdf', Buffer.from(source));
  await test.info().attach('wp05-synthetic-rotated-cropbox-source.pdf', {
    body: Buffer.from(source),
    contentType: 'application/pdf',
  });
  await openSourcePdf(page, source);
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /OCR Area/ }).click();

  const capture = page.getByTestId('writer-overlay-capture').first();
  await expect(capture).toBeVisible();
  const bounds = await capture.boundingBox();
  if (!bounds) throw new Error('OCR area page bounding box unavailable');
  const left = bounds.x + Math.min(bounds.width * 0.2, 35);
  const top = bounds.y + Math.min(bounds.height * 0.2, 35);
  const right = bounds.x + Math.min(bounds.width * 0.65, 180);
  const bottom = bounds.y + Math.min(bounds.height * 0.55, 155);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 5 });
  await page.mouse.up();

  const picker = page.getByTestId('ocr-document-region-mode-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'text', exact: true }).click();
  await expect(page.getByTestId('ocr-region-row')).toHaveCount(1);

  const firstZip = await saveProject(page);
  await persistWp05SyntheticEvidence('wp05-synthetic-first-project.pdfhub.zip', firstZip);
  await test.info().attach('wp05-synthetic-first-project.pdfhub.zip', {
    body: firstZip,
    contentType: 'application/zip',
  });
  const first = await readRegions(firstZip);
  expect(first).toHaveLength(1);
  expect(first[0].geometryProvenance).toBe('pdf-user-space-v2');
  expect(first[0].pageIndex).toBe(0);
  expect(first[0].bbox.width).toBeGreaterThan(1);
  expect(first[0].bbox.height).toBeGreaterThan(1);
  // Source /CropBox has a nonzero lower-left and a 90-degree rotation.
  expect(first[0].bbox.x).toBeGreaterThanOrEqual(70);
  expect(first[0].bbox.y).toBeGreaterThanOrEqual(100);
  expect(first[0].bbox.x + first[0].bbox.width).toBeLessThanOrEqual(540);
  expect(first[0].bbox.y + first[0].bbox.height).toBeLessThanOrEqual(620);

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await stubNativeFilePickers(reopened);
    await reopened.goto('./');
    // The native project input belongs to the Write-mode ribbon; it is not
    // mounted in a fresh default File-mode workspace.
    await reopened.getByRole('tab', { name: 'Write' }).click();
    await reopened.getByLabel('Import editable Writer project or PDF').setInputFiles({
      name: 'wp05-proof.pdfhub.zip',
      mimeType: 'application/zip',
      buffer: firstZip,
    });
    await expect(reopened.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
    // OCR review is a separate left-rail panel, not automatically visible
    // just because the project contains restored OCR state.
    await reopened.getByRole('button', { name: 'OCR', exact: true }).click();
    await expect(reopened.getByTestId('ocr-region-row')).toHaveCount(1, { timeout: 15_000 });
    const secondZip = await saveProject(reopened);
    await persistWp05SyntheticEvidence('wp05-synthetic-second-project.pdfhub.zip', secondZip);
    await test.info().attach('wp05-synthetic-second-project.pdfhub.zip', {
      body: secondZip,
      contentType: 'application/zip',
    });
    const second = await readRegions(secondZip);
    expect(second).toEqual(first);
  } finally {
    if (!fresh.pages().every((opened) => opened.isClosed())) {
      await fresh.close().catch(() => undefined);
    }
  }
});
