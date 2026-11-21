import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-underline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 15000 });
}

async function expectFirstLine(page: Page, expected: number[]) {
  const node = page.locator('[data-page="1"] [data-annotation-type="underline"]');
  await expect(node.locator('line')).toHaveCount(2);
  const normalized = await node.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const line = element.querySelector('line')!;
    return ['x1', 'y1', 'x2', 'y2'].map((key, index) => Number(line.getAttribute(key)) / (index % 2 ? bounds.height : bounds.width));
  });
  normalized.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 2));
}

test('rotates a cropped page at 125% zoom and reopens its native underline', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([400, 500]);
  pdfPage.setCropBox(20, 30, 360, 450);
  const form = doc.context.register(doc.context.flateStream('q 0 0 0 RG 0 8 m 160 8 l S Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: {} }));
  const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Underline', NM: PDFString.of('synthetic'),
    Rect: [30, 400, 230, 450], QuadPoints: [30, 450, 190, 450, 30, 440, 190, 440,
      50, 420, 170, 420, 170, 410, 50, 410], AP: { N: form } }));
  pdfPage.node.set(PDFName.of('Annots'), doc.context.obj([root]));
  await open(page, await doc.save());
  await page.getByRole('slider').fill('125');
  await expectFirstLine(page, [0, 0.166, 0.8, 0.166]);
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
  await expect.poll(async () => {
    const line = page.locator('[data-page="1"] [data-annotation-type="underline"] line').first();
    return Number(await line.getAttribute('x1')) - Number(await line.getAttribute('x2'));
  }, { timeout: 30000 }).toBeCloseTo(0);
  await expectFirstLine(page, [0.834, 0, 0.834, 0.8]);
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const savedBytes = new Uint8Array(Buffer.concat(chunks));
  const saved = await PDFDocument.load(savedBytes);
  expect(saved.getPage(0).getRotation().angle).toBe(90);
  const savedRoot = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const savedForm = savedRoot.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  expect(Buffer.from(decodePDFRawStream(savedForm as PDFRawStream).decode()).toString()).toBe('q 0 0 0 RG 0 8 m 160 8 l S Q');
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, savedBytes);
    await expectFirstLine(reopened, [0.834, 0, 0.834, 0.8]);
  } finally { await fresh.close(); }
});
