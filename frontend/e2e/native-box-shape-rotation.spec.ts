import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

async function fixture(subtype: 'Square' | 'Circle') {
  const doc = await PDFDocument.create(); const page = doc.addPage([400, 500]);
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 8 8 25 12 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: subtype, NM: PDFString.of('shape'), P: page.ref,
    Rect: [100, 100, 200, 160], C: [0.1, 0.2, 0.3], AP: { N: ap } }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([root])); return doc.save();
}
async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page); await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-shape.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream(); if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}
async function nativeGeometry(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes); const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const rect = root.lookup(PDFName.of('Rect'), PDFArray).asArray().map((value) => Number(value.toString()));
  const ap = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  return { rect, wrapped: Boolean(ap.dict.get(PDFName.of('PDFHubWrappedOriginal'))) };
}
for (const [subtype, selector] of [['Square', 'shape-rect'], ['Circle', 'shape-ellipse']] as const) {
  test(`rotates an imported ${subtype}, undo/redo, reopen and second turn`, async ({ page, browser }) => {
    test.setTimeout(120_000); await open(page, await fixture(subtype));
    await page.locator(`[data-annotation-type="${selector}"]`).first().click({ force: true });
    await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
    const first = await save(page);
    expect(await nativeGeometry(first)).toEqual({ rect: [120, 80, 180, 180], wrapped: true });
    await page.getByRole('tab', { name: 'Annotate' }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await nativeGeometry(await save(page))).toEqual({ rect: [100, 100, 200, 160], wrapped: false });
    await page.getByRole('tab', { name: 'Annotate' }).click(); await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await nativeGeometry(await save(page))).toEqual(await nativeGeometry(first));
    const fresh = await browser.newContext(); try {
      const reopened = await fresh.newPage(); await open(reopened, first);
      await reopened.locator(`[data-annotation-type="${selector}"]`).first().click({ force: true });
      await reopened.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
      expect(await nativeGeometry(await save(reopened))).toEqual({ rect: [100, 100, 200, 160], wrapped: true });
    } finally { await fresh.close(); }
  });
}
