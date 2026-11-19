import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, degrees } from 'pdf-lib';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

const key = PDFName.of;

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({ name: 'rotated-page.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}

async function save(page: Page): Promise<Uint8Array> {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(key('Annots'), PDFArray);
  const root = annots.lookup(0, PDFDict);
  const normal = root.lookup(key('AP'), PDFDict).lookup(key('N'), PDFStream);
  const numbers = (dict: PDFDict, field: string) => dict.lookup(key(field), PDFArray).asArray().map((v) => Number(v.toString()));
  return { rotation: page.getRotation().angle, rect: numbers(root, 'Rect'),
    bbox: numbers(normal.dict, 'BBox'), matrix: numbers(normal.dict, 'Matrix'),
    fingerprint: Boolean(root.get(key('PDFHubStampAPFingerprint'))) };
}

test('creates an upright stamp on a rotated crop and preserves it when rotating the page', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([450, 550]);
  pdfPage.setCropBox(25, 30, 300, 400);
  pdfPage.setRotation(degrees(90));
  await open(page, await pdf.save());
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Stamp', exact: true }).click();
  await page.locator('[data-page="1"]').click({ position: { x: 50, y: 100 } });
  const liveStamp = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await expect(liveStamp).toContainText('APPROVED');
  await expect(liveStamp).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

  const before = await save(page);
  const first = await inspect(before);
  expect(first.rotation).toBe(90);
  expect(first.rect[2] - first.rect[0]).toBeCloseTo(36);
  expect(first.rect[3] - first.rect[1]).toBeCloseTo(150);
  expect(first.bbox).toEqual([0, 0, 150, 36]);
  expect(first.matrix).toEqual([0, 1, -1, 0, 36, 0]);
  expect(first.fingerprint).toBe(true);

  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
  await expect.poll(async () => {
    const box = await page.locator('[data-page="1"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeLessThan(1);
  await expect(liveStamp).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  const after = await save(page);
  const rotated = await inspect(after);
  expect(rotated.rotation).toBe(180);
  expect(rotated.rect).toEqual(first.rect);
  expect(rotated.bbox).toEqual(first.bbox);
  expect(rotated.matrix).toEqual(first.matrix);
  expect(rotated.fingerprint).toBe(true);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => {
    const box = await page.locator('[data-page="1"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(1);
  const undone = await inspect(await save(page));
  expect(undone.rotation).toBe(90);
  expect(undone.rect).toEqual(first.rect);
  expect(undone.fingerprint).toBe(true);
  await expect(liveStamp).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => {
    const box = await page.locator('[data-page="1"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeLessThan(1);
  const redone = await inspect(await save(page));
  expect(redone.rotation).toBe(180);
  expect(redone.rect).toEqual(first.rect);
  expect(redone.fingerprint).toBe(true);

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, after);
    const stamp = reopened.locator('[data-page="1"] [data-annotation-type="stamp"]');
    await expect(stamp).toContainText('APPROVED');
    await expect(stamp).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
    await stamp.click();
    await expect(reopened.getByRole('textbox', { name: 'Text', exact: true })).toBeEnabled();
  } finally { await fresh.close(); }

  const evidence = process.env.WP01_SYNTHETIC_STAMP_PAGE_EVIDENCE_DIR;
  if (evidence) {
    await fs.mkdir(evidence, { recursive: true });
    await fs.writeFile(path.join(evidence, 'before-page-rotation.pdf'), before);
    await fs.writeFile(path.join(evidence, 'after-page-rotation.pdf'), after);
  }
});

test('rotates a newly created stamp with the page before its first save', async ({ page }) => {
  test.setTimeout(90_000);
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([450, 550]);
  pdfPage.setCropBox(25, 30, 300, 400);
  pdfPage.setRotation(degrees(90));
  await open(page, await pdf.save());
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Stamp', exact: true }).click();
  await page.locator('[data-page="1"]').click({ position: { x: 50, y: 100 } });
  const stamp = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await expect(stamp).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
  await expect(stamp).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)', { timeout: 30_000 });
  const bytes = await save(page);
  const result = await inspect(bytes);
  expect(result.rotation).toBe(180);
  expect(result.rect[2] - result.rect[0]).toBeCloseTo(36);
  expect(result.rect[3] - result.rect[1]).toBeCloseTo(150);
  expect(result.bbox).toEqual([0, 0, 150, 36]);
  expect(result.matrix).toEqual([0, 1, -1, 0, 36, 0]);
  expect(result.fingerprint).toBe(true);
  const evidence = process.env.WP01_SYNTHETIC_STAMP_PAGE_EVIDENCE_DIR;
  if (evidence) {
    await fs.mkdir(evidence, { recursive: true });
    await fs.writeFile(path.join(evidence, 'before-first-save-page-rotation.pdf'), bytes);
  }
});
