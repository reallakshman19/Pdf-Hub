import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 8 8 25 12 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Polygon', NM: PDFString.of('polygon'), P: page.ref,
    Rect: [100, 100, 200, 160], Vertices: [110, 110, 185, 120, 160, 150, 120, 140],
    C: [0.1, 0.2, 0.3], AP: { N: ap },
  }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
  return doc.save();
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-polygon.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const failure = await download.failure();
  if (failure) throw new Error(`Synthetic PDF download failed: ${failure}`);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const result = Buffer.concat(chunks);
  if (result.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(`Invalid PDF download: name=${download.suggestedFilename()}, bytes=${result.length}, prefix=${result.subarray(0, 16).toString('hex')}`);
  }
  return new Uint8Array(result);
}

async function nativeGeometry(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const values = (key: string) => root.lookup(PDFName.of(key), PDFArray).asArray().map((v) => Number(v.toString()));
  const ap = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  return { rect: values('Rect'), vertices: values('Vertices'), wrapped: Boolean(ap.dict.get(PDFName.of('PDFHubWrappedOriginal'))) };
}

test('rotates an imported polygon, preserves undo and redo, then rotates again after reopen', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await open(page, await fixture());
  const polygon = page.locator('[data-page="1"] svg polygon').first().locator('xpath=../..');
  await polygon.click();
  const rotate = page.getByRole('button', { name: 'Rotate 90° clockwise' });
  await expect(rotate).toBeVisible();
  await rotate.click();
  const first = await save(page);
  expect(await nativeGeometry(first)).toEqual({
    rect: [120, 80, 180, 180], vertices: [130, 170, 140, 95, 170, 120, 160, 160], wrapped: true,
  });
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await nativeGeometry(await save(page))).toEqual({
    rect: [100, 100, 200, 160], vertices: [110, 110, 185, 120, 160, 150, 120, 140], wrapped: false,
  });
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await nativeGeometry(await save(page))).toEqual(await nativeGeometry(first));

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, first);
    const restored = reopened.locator('[data-page="1"] svg polygon').first().locator('xpath=../..');
    await restored.click();
    const rotateAgain = reopened.getByRole('button', { name: 'Rotate 90° clockwise' });
    await expect(rotateAgain).toBeVisible();
    await rotateAgain.click();
    expect(await nativeGeometry(await save(reopened))).toEqual({
      rect: [100, 100, 200, 160], vertices: [190, 150, 115, 140, 140, 110, 180, 120], wrapped: true,
    });
  } finally { await fresh.close(); }
});
