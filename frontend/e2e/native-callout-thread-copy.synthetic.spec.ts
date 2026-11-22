import { test, expect, type Page } from '@playwright/test';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function fixture(targetRotation: number) {
  const pdf = await PDFDocument.create();
  const source = pdf.addPage([612, 792]);
  const destination = pdf.addPage([612, 792]);
  destination.setRotation(degrees(targetRotation));
  const font = pdf.context.register(pdf.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' }));
  const ap = pdf.context.register(pdf.context.flateStream('q BT /F1 12 Tf 0 0 0 rg 32 72 Td (Original Body) Tj ET Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 230, 100], Resources: { Font: { F1: font } },
  }));
  const popup = pdf.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [300, 520, 400, 600], P: source.ref });
  const popupRef = pdf.context.register(popup);
  const callout = pdf.context.obj({
    Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout', P: source.ref,
    Rect: [50, 520, 280, 620], RD: [30, 0, 0, 50], CL: [50, 520, 70, 570, 80, 580], LE: 'OpenArrow',
    NM: PDFString.of('source-callout'), Contents: PDFHexString.fromText('Original Body'),
    DA: PDFString.of('/Helv 12 Tf 0 0 0 rg'),
    RC: PDFHexString.fromText('<body xmlns="http://www.w3.org/1999/xhtml" style="font-family:Helvetica;font-size:12pt;color:#000000"><p>Original <span style="color:#ff0000">Body</span></p></body>'),
    AP: { N: ap }, Popup: popupRef,
  });
  const rootRef = pdf.context.register(callout);
  popup.set(PDFName.of('Parent'), rootRef);
  const reply = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Text', P: source.ref, Rect: [50, 520, 68, 538],
    NM: PDFString.of('source-reply'), Contents: PDFHexString.fromText('Synthetic reply'),
    T: PDFHexString.fromText('Reviewer'), IRT: rootRef, RT: 'R', F: 4,
  }));
  source.node.set(PDFName.of('Annots'), pdf.context.obj([rootRef, popupRef, reply]));
  return pdf.save();
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-callout-thread.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 15_000 });
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

function text(dict: PDFDict, key: string) {
  return dict.lookupMaybe(PDFName.of(key), PDFHexString, PDFString)?.decodeText();
}

function verifyPage(pdf: PDFDocument, index: number, expected: string) {
  const annots = pdf.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray);
  const entries = Array.from({ length: annots.size() }, (_, i) => ({ ref: annots.get(i), dict: annots.lookup(i, PDFDict) }));
  const roots = entries.filter(({ dict }) => dict.get(PDFName.of('Subtype'))?.toString() === '/FreeText');
  expect(roots).toHaveLength(1);
  const root = roots[0];
  expect(text(root.dict, 'Contents')).toBe(expected);
  expect(text(root.dict, 'RC')).toContain('color:#ff0000');
  expect(root.dict.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  expect(root.dict.lookup(PDFName.of('CL'), PDFArray).size()).toBe(6);
  const popupRef = root.dict.get(PDFName.of('Popup'));
  expect(popupRef).toBeInstanceOf(PDFRef);
  const popup = pdf.context.lookup(popupRef!, PDFDict);
  expect(popup.get(PDFName.of('Parent'))?.toString()).toBe(root.ref.toString());
  const replies = entries.filter(({ dict }) => dict.get(PDFName.of('RT'))?.toString() === '/R');
  expect(replies).toHaveLength(1);
  expect(text(replies[0].dict, 'Contents')).toBe('Synthetic reply');
  expect(replies[0].dict.get(PDFName.of('IRT'))?.toString()).toBe(root.ref.toString());
  return { name: text(root.dict, 'NM'), rect: root.dict.lookup(PDFName.of('Rect'), PDFArray).toString(), leader: root.dict.lookup(PDFName.of('CL'), PDFArray).toString() };
}

for (const targetRotation of [0, 90]) {
  test(`keyboard-copy imported rich callout with reply to a ${targetRotation}° page and edit after reopen`, async ({ page, browser }) => {
    test.setTimeout(90_000);
    await open(page, await fixture(targetRotation));
    const source = page.locator('[data-page="1"] [data-annotation-type="callout"]');
    await expect(source.getByText('Original Body')).toBeVisible();
    await source.getByText('Original Body').click();
    await page.keyboard.press('Control+c');
    await page.getByRole('button', { name: /^Page 2\b/ }).click();
    await expect(page.locator('[data-page="2"] canvas')).toBeVisible();
    await page.keyboard.press('Control+v');
    const copy = page.locator('[data-page="2"] [data-annotation-type="callout"]');
    await expect(copy).toHaveCount(1);
    const firstBytes = await save(page);
    const first = await PDFDocument.load(firstBytes);
    const sourceSnapshot = verifyPage(first, 0, 'Original Body');
    const copySnapshot = verifyPage(first, 1, 'Original Body');
    expect(copySnapshot.name).not.toBe(sourceSnapshot.name);

    const fresh = await browser.newContext();
    try {
      const reopened = await fresh.newPage();
      await open(reopened, firstBytes);
      await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
      const restored = reopened.locator('[data-page="2"] [data-annotation-type="callout"]');
      await restored.getByText('Original Body').dblclick();
      const editor = restored.locator('textarea');
      await expect(editor).toBeVisible();
      await editor.fill('Original Better');
      await editor.press('Control+Enter');
      const second = await PDFDocument.load(await save(reopened));
      expect(verifyPage(second, 0, 'Original Body')).toEqual(sourceSnapshot);
      verifyPage(second, 1, 'Original Better');
    } finally { await fresh.close(); }
  });
}
