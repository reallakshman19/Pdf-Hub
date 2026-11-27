import { test, expect, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 } });

async function inputPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = doc.context.register(doc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' }));
  const ap = doc.context.register(doc.context.flateStream('q BT /F1 12 Tf 0 0 0 rg 32 72 Td (Original Body) Tj ET Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 230, 100], Resources: { Font: { F1: font } },
  }));
  const dict = doc.context.obj({
    Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout',
    Rect: [50, 520, 280, 620], RD: [30, 0, 0, 50], CL: [50, 520, 70, 570, 80, 580],
    LE: 'OpenArrow', P: page.ref, NM: PDFString.of('synthetic-callout'),
    Contents: PDFHexString.fromText('Original Body'), DA: PDFString.of('/Helv 12 Tf 0 0 0 rg'),
    RC: PDFHexString.fromText('<body xmlns="http://www.w3.org/1999/xhtml" style="font-family:Helvetica;font-size:12pt;color:#000000"><p>Original <span style="color:#ff0000">Body</span></p></body>'),
    AP: { N: ap },
  });
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(dict)]));
  return doc.save();
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({ name: 'synthetic-callout.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
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

test('an imported styled callout remains native and styled after edit, save, and reopen', async ({ page, browser }) => {
  await open(page, await inputPdf());
  const callout = page.locator('[data-annotation-type="callout"]').first();
  await expect(callout.getByText('Original Body')).toBeVisible();
  await callout.getByText('Original Body').dblclick();
  const editor = callout.locator('textarea');
  await expect(editor).toBeVisible();
  await editor.fill('Original Better');
  await editor.press('Control+Enter');
  await expect(editor).toHaveCount(0);

  const bytes = await save(page);
  const pdf = await PDFDocument.load(bytes);
  const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const root = annots.lookup(0, PDFDict);
  expect(root.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Original Better');
  const rich = root.lookup(PDFName.of('RC'), PDFHexString).decodeText();
  expect(rich).toContain('color:#ff0000');
  expect(rich).toContain('Better');
  expect(root.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  expect(root.lookup(PDFName.of('CL'), PDFArray).size()).toBe(6);

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, bytes);
    await expect(reopened.locator('[data-annotation-type="callout"]').getByText('Original Better')).toBeVisible();
  } finally { await fresh.close(); }
});

test('adds and removes a line break in an imported rich callout across reopen and save', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await open(page, await inputPdf());
  const callout = page.locator('[data-annotation-type="callout"]').first();
  await callout.getByText('Original Body').dblclick();
  const editor = callout.locator('textarea');
  await editor.fill('Original\nBody');
  await editor.press('Control+Enter');
  await expect(editor).toHaveCount(0);
  const first = await save(page);
  const firstPdf = await PDFDocument.load(first);
  const firstRoot = firstPdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  expect(firstRoot.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Original\nBody');
  expect(firstRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toContain('<br');
  expect(firstRoot.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, first);
    const restored = reopened.locator('[data-annotation-type="callout"]').first();
    await restored.locator('div').first().dblclick();
    const nextEditor = restored.locator('textarea');
    await expect(nextEditor).toHaveValue('Original\nBody');
    await nextEditor.fill('Original Better');
    await nextEditor.press('Control+Enter');
    await expect(nextEditor).toHaveCount(0);
    await expect(restored.getByText('Original Better')).toBeVisible();
    const secondPdf = await PDFDocument.load(await save(reopened));
    const secondRoot = secondPdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(secondRoot.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Original Better');
    expect(secondRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).not.toContain('<br');
    expect(secondRoot.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  } finally { await fresh.close(); }
});

test('rotates an imported callout and leader, then edits it after reopening', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await open(page, await inputPdf());
  const callout = page.locator('[data-annotation-type="callout"]').first();
  await callout.getByText('Original Body').click();
  await page.getByRole('combobox', { name: 'Rotation', exact: true }).selectOption('90');
  await expect(callout).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  const bytes = await save(page);
  const pdf = await PDFDocument.load(bytes);
  const root = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  expect(root.lookup(PDFName.of('Rect'), PDFArray).asArray().map((value) => Number(value.toString()))).toEqual([105, 495, 205, 725]);
  expect(root.lookup(PDFName.of('CL'), PDFArray).asArray().map((value) => Number(value.toString()))).toEqual([105, 725, 155, 705, 165, 695]);
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await open(reopened, bytes);
    const restored = reopened.locator('[data-annotation-type="callout"]').first();
    await expect(restored).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
    await restored.getByText('Original Body').dblclick();
    const editor = restored.locator('textarea');
    await editor.fill('Original Better');
    await editor.press('Control+Enter');
    const edited = await PDFDocument.load(await save(reopened));
    const editedRoot = edited.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(editedRoot.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Original Better');
    expect(editedRoot.lookup(PDFName.of('RC'), PDFHexString).decodeText()).toContain('color:#ff0000');
    expect(editedRoot.lookup(PDFName.of('CL'), PDFArray).asArray().map((value) => Number(value.toString()))).toEqual([105, 725, 155, 705, 165, 695]);
  } finally { await fresh.close(); }
});
