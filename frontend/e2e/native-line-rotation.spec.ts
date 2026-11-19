import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

async function emptyPdf() {
  const document = await PDFDocument.create();
  document.addPage([400, 500]);
  return document.save();
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({ name: 'synthetic-line.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

async function nativeLine(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const annotations = document.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const lines = Array.from({ length: annotations.size() }, (_, index) => annotations.lookup(index, PDFDict))
    .filter((root) => root.get(PDFName.of('Subtype'))?.toString() === '/Line');
  expect(lines).toHaveLength(1);
  const root = lines[0];
  const numbers = (key: string) => root.lookup(PDFName.of(key), PDFArray).asArray().map((value) => Number(value.toString()));
  const appearance = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  expect(appearance.dict.get(PDFName.of('Subtype'))?.toString()).toBe('/Form');
  const endings = root.lookupMaybe(PDFName.of('LE'), PDFArray);
  return {
    line: numbers('L'), rect: numbers('Rect'),
    endings: endings?.asArray().map((value) => value.toString()),
    color: root.get(PDFName.of('C'))?.toString(),
    opacity: root.get(PDFName.of('CA'))?.toString(),
    wrapped: Boolean(appearance.dict.get(PDFName.of('PDFHubWrappedOriginal'))),
  };
}

function clockwise(line: number[], center: { x: number; y: number }) {
  const result: number[] = [];
  for (let i = 0; i < line.length; i += 2) {
    result.push(center.x + line[i + 1] - center.y, center.y - line[i] + center.x);
  }
  return result;
}

function expectLineClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(4);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3));
}

async function selectLine(page: Page) {
  const line = page.locator('[data-page="1"] svg line').first();
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();
  await line.click({ force: true });
}

for (const tool of ['Line', 'Arrow'] as const) {
  test(`creates a native ${tool.toLowerCase()}, rotates it through save and undo/redo, then rotates again after reopen`, async ({ page, browser }) => {
    test.setTimeout(180_000);
    await open(page, await emptyPdf());
    await page.getByRole('tab', { name: 'Draw' }).click();
    await page.getByRole('button', { name: tool, exact: true }).click();
    const canvas = page.locator('[data-page="1"] canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Synthetic page is not visible');
    // Reverse the horizontal endpoint order to catch accidental LE or L swapping.
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.25);
    await page.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.45);
    await expect(page.locator('[data-page="1"] svg line').first()).toBeVisible();
    const original = await nativeLine(await save(page));
    if (tool === 'Arrow') expect(original.endings).toEqual(['/None', '/ClosedArrow']);
    else expect(original.endings).toBeUndefined();

    await page.getByRole('tab', { name: 'Draw' }).click();
    await selectLine(page);
    await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
    const rotatedBytes = await save(page);
    const rotated = await nativeLine(rotatedBytes);
    const initialCenter = { x: (original.line[0] + original.line[2]) / 2, y: (original.line[1] + original.line[3]) / 2 };
    expectLineClose(rotated.line, clockwise(original.line, initialCenter));
    expect(rotated.endings).toEqual(original.endings);
    expect(rotated.color).toBe(original.color);
    expect(rotated.opacity).toBe(original.opacity);

    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const undone = await nativeLine(await save(page));
    expectLineClose(undone.line, original.line);
    expect(undone.endings).toEqual(original.endings);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    const redone = await nativeLine(await save(page));
    expectLineClose(redone.line, rotated.line);
    expect(redone.endings).toEqual(original.endings);

    const context = await browser.newContext();
    try {
      const reopened = await context.newPage();
      await open(reopened, rotatedBytes);
      await selectLine(reopened);
      await reopened.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
      const second = await nativeLine(await save(reopened));
      const center = { x: (rotated.rect[0] + rotated.rect[2]) / 2, y: (rotated.rect[1] + rotated.rect[3]) / 2 };
      expectLineClose(second.line, clockwise(rotated.line, center));
      expect(second.endings).toEqual(original.endings);
      expect(second.wrapped).toBe(true);
    } finally {
      await context.close();
    }
  });
}
