import { test, expect, type Page } from '@playwright/test';
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString,
  PDFName, PDFNumber, StandardFonts,
} from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 } });

async function nativeLabeledSource() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 3; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(['COVER ORIGINAL', 'FRONT ORIGINAL', 'BODY ORIGINAL'][index]!, {
      x: 80, y: 690, size: 16, font,
    });
  }
  const labels = pdf.context.obj({ Nums: [
    0, { P: PDFHexString.fromText('Cover') },
    1, { S: PDFName.of('r') },
    2, { S: PDFName.of('D'), P: PDFHexString.fromText('Body-'), St: 7 },
  ] });
  pdf.catalog.set(PDFName.of('PageLabels'), labels);
  pdf.catalog.set(PDFName.of('WP05NativeSentinel'), PDFHexString.fromText('retain-source-metadata'));
  return new Uint8Array(await pdf.save());
}

async function openRealPdf(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'wp05-native-labels.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
}

async function saveNativePdf(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('PDF Save produced no download stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

async function assertNativeLabelRules(bytes: Uint8Array, expected: Array<{
  start: number; style?: string; prefix?: string; number?: number;
}>) {
  // Verify the emitted PDF itself, independent of the application's PageGraph,
  // test fixtures, and React UI labels.
  const pdf = await PDFDocument.load(bytes);
  const sentinel = pdf.catalog.lookupMaybe(PDFName.of('WP05NativeSentinel'), PDFHexString);
  expect(sentinel?.decodeText()).toBe('retain-source-metadata');
  const root = pdf.catalog.lookupMaybe(PDFName.of('PageLabels'), PDFDict);
  expect(root, 'native /PageLabels must survive Save').toBeTruthy();
  const nums = root?.lookupMaybe(PDFName.of('Nums'), PDFArray);
  expect(nums?.size()).toBe(expected.length * 2);
  const entries = expected.map((_, index) => {
    const start = nums?.lookupMaybe(index * 2, PDFNumber)?.asNumber();
    const dict = nums?.lookupMaybe(index * 2 + 1, PDFDict);
    const style = dict?.lookupMaybe(PDFName.of('S'), PDFName)?.asString();
    const prefix = dict?.lookupMaybe(PDFName.of('P'), PDFHexString)?.decodeText();
    const number = dict?.lookupMaybe(PDFName.of('St'), PDFNumber)?.asNumber();
    return {
      start,
      ...(style !== undefined ? { style } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(number !== undefined ? { number } : {}),
    };
  });
  expect(entries).toEqual(expected);
  return pdf;
}

test('P02/P04: native PageLabels survive browser rotate, PDF Save and fresh-context reopen', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const source = await nativeLabeledSource();
  await openRealPdf(page, source);
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();

  const firstSave = await saveNativePdf(page);
  await test.info().attach('wp05-rotate-native-output.pdf', {
    body: Buffer.from(firstSave),
    contentType: 'application/pdf',
  });
  const native = await assertNativeLabelRules(firstSave, [
    { start: 0, prefix: 'Cover' },
    { start: 1, style: '/r' },
    { start: 2, style: '/D', prefix: 'Body-', number: 7 },
  ]);
  expect(native.getPage(0).getRotation().angle).toBe(90);

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await openRealPdf(reopened, firstSave);
    await reopened.getByRole('tab', { name: 'Organize' }).click();
    await reopened.getByRole('button', { name: 'Rotate selected or current pages' }).click();
    const secondSave = await saveNativePdf(reopened);
    const reopenedNative = await assertNativeLabelRules(secondSave, [
      { start: 0, prefix: 'Cover' },
      { start: 1, style: '/r' },
      { start: 2, style: '/D', prefix: 'Body-', number: 7 },
    ]);
    expect(reopenedNative.getPage(0).getRotation().angle).toBe(180);
  } finally {
    await fresh.close();
  }
});

test('P04: native range starts reanchor on browser Delete, survive Save and reopen', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const source = await nativeLabeledSource();
  await openRealPdf(page, source);
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Delete selected or current pages' }).click();
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();

  const saved = await saveNativePdf(page);
  await test.info().attach('wp05-delete-native-output.pdf', {
    body: Buffer.from(saved),
    contentType: 'application/pdf',
  });
  const native = await assertNativeLabelRules(saved, [
    { start: 0, style: '/r' },
    { start: 1, style: '/D', prefix: 'Body-', number: 7 },
  ]);
  expect(native.getPageCount()).toBe(2);

  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await openRealPdf(reopened, saved);
    await reopened.getByRole('tab', { name: 'Organize' }).click();
    await reopened.getByRole('button', { name: 'Rotate selected or current pages' }).click();
    const secondSave = await saveNativePdf(reopened);
    const reopenedNative = await assertNativeLabelRules(secondSave, [
      { start: 0, style: '/r' },
      { start: 1, style: '/D', prefix: 'Body-', number: 7 },
    ]);
    expect(reopenedNative.getPageCount()).toBe(2);
    expect(reopenedNative.getPage(0).getRotation().angle).toBe(90);
  } finally {
    await fresh.close();
  }
});
