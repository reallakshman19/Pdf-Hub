import { expect, test, type Page } from '@playwright/test';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-note.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

test('copies an imported note, edits before save, and reopens both pages', async ({ page, browser }) => {
  const doc = await PDFDocument.create();
  const source = doc.addPage([400, 500]);
  doc.addPage([400, 500]).setRotation(degrees(90));
  const note = doc.context.obj({ Type: 'Annot', Subtype: 'Text', PDFHubType: PDFString.of('comment'),
    NM: PDFString.of('original-note'), Contents: PDFString.of('old note'), Rect: [60, 300, 100, 320], P: source.ref });
  source.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(note)]));
  await open(page, await doc.save());
  const original = page.locator('[data-page="1"] [data-annotation-type="comment"]');
  await original.click();
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.keyboard.press('Control+v');
  const copy = page.locator('[data-page="2"] [data-annotation-type="comment"]');
  await expect(copy).toHaveCount(1);
  const preview = await copy.boundingBox();
  await copy.dblclick();
  const editor = copy.locator('textarea');
  await editor.fill('new note');
  await editor.press('Control+Enter');
  const bytes = await save(page);
  const saved = await PDFDocument.load(bytes);
  const text = (index: number) => saved.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray)
    .lookup(0, PDFDict).lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText();
  expect(text(0)).toBe('old note');
  expect(text(1)).toBe('new note');
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, bytes);
    await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
    const restored = reopened.locator('[data-page="2"] [data-annotation-type="comment"]');
    await expect(restored).toContainText('new note');
    const after = await restored.boundingBox();
    expect(after?.width).toBeCloseTo(preview!.width, 1);
    expect(after?.height).toBeCloseTo(preview!.height, 1);
  } finally { await fresh.close(); }
});
