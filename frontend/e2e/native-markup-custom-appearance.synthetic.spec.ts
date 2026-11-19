import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-markup.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 15000 });
}

test('comments on and copies imported markup while preserving its native appearance', async ({ page, browser }) => {
  test.setTimeout(60000);
  const doc = await PDFDocument.create();
  const first = doc.addPage([400, 500]);
  doc.addPage([400, 500]);
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 12 8 re f Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 30], Resources: {} }));
  const markup = doc.context.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [60, 300, 160, 330],
    QuadPoints: [60, 330, 160, 330, 60, 300, 160, 300], P: first.ref, AP: { N: appearance } });
  first.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(markup)]));
  await open(page, await doc.save());
  const original = page.locator('[data-page="1"] [style*="mix-blend-mode: multiply"]');
  await original.click();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await page.getByLabel('Comment on selected annotation').fill('Synthetic review comment');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByText('Synthetic review comment')).toBeVisible();
  await original.click();
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.keyboard.press('Control+v');
  await expect(page.locator('[data-page="2"] [style*="mix-blend-mode: multiply"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const bytes = new Uint8Array(Buffer.concat(chunks));
  const saved = await PDFDocument.load(bytes);
  for (const pdfPage of saved.getPages()) {
    const annots = pdfPage.node.lookup(PDFName.of('Annots'), PDFArray);
    const root = annots.asArray().map((_, i) => annots.lookup(i, PDFDict))
      .find((item) => item.lookup(PDFName.of('Subtype'), PDFName).decodeText() === 'Highlight');
    expect(root).toBeDefined();
    const form = root!.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    expect(form).toBeInstanceOf(PDFRawStream);
    expect(Buffer.from(decodePDFRawStream(form as PDFRawStream).decode()).toString()).toBe('q 1 0 0 rg 0 0 12 8 re f Q');
    expect(annots.size()).toBeGreaterThan(1);
  }
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, bytes);
    await expect(reopened.locator('[data-page="1"] [style*="mix-blend-mode: multiply"]')).toHaveCount(1);
    await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
    await expect(reopened.locator('[data-page="2"] [style*="mix-blend-mode: multiply"]')).toHaveCount(1);
  } finally { await fresh.close(); }
});
