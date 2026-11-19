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
  await picker.setFiles({ name: 'synthetic-ink.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
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

async function nativeInk(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const annotations = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const ink = Array.from({ length: annotations.size() }, (_, index) => annotations.lookup(index, PDFDict))
    .filter((root) => root.get(PDFName.of('Subtype'))?.toString() === '/Ink');
  expect(ink).toHaveLength(1);
  const root = ink[0];
  const array = (value: PDFArray) => value.asArray().map((number) => Number(number.toString()));
  const list = root.lookup(PDFName.of('InkList'), PDFArray);
  const paths = Array.from({ length: list.size() }, (_, index) => array(list.lookup(index, PDFArray)));
  const rect = array(root.lookup(PDFName.of('Rect'), PDFArray));
  const appearance = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  expect(appearance.dict.get(PDFName.of('Subtype'))?.toString()).toBe('/Form');
  return { paths, rect, color: root.get(PDFName.of('C'))?.toString(),
    opacity: root.get(PDFName.of('CA'))?.toString(), wrapped: Boolean(appearance.dict.get(PDFName.of('PDFHubWrappedOriginal'))) };
}

// The app displays clockwise turns in top-left coordinates; PDF uses bottom-left coordinates.
function clockwise(paths: number[][], rect: number[]) {
  const cx = (rect[0] + rect[2]) / 2;
  const cy = (rect[1] + rect[3]) / 2;
  return paths.map((path) => {
    const result: number[] = [];
    for (let i = 0; i < path.length; i += 2) result.push(cx + path[i + 1] - cy, cy - path[i] + cx);
    return result;
  });
}

function expectPathsClose(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((path, i) => {
    expect(path).toHaveLength(expected[i].length);
    path.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j], 3));
  });
}

const inkPath = (page: Page) => page.locator('[data-page="1"] svg path[stroke-linecap="round"]').first();

async function selectInk(page: Page) {
  const path = inkPath(page);
  await expect(path).toBeVisible();
  await path.scrollIntoViewIfNeeded();
  const point = await path.evaluate((element) => {
    const svgPath = element as SVGPathElement;
    const local = svgPath.getPointAtLength(svgPath.getTotalLength() / 2);
    const matrix = svgPath.getScreenCTM();
    if (!matrix) throw new Error('Synthetic ink path is not visible');
    const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
}

test('creates ink, rotates it through save and undo/redo, then rotates again after reopen', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await open(page, await emptyPdf());
  await page.getByRole('tab', { name: 'Draw' }).click();
  await page.getByRole('button', { name: 'Ink', exact: true }).click();
  const canvas = page.locator('[data-page="1"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Synthetic page is not visible');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.50, box.y + box.height * 0.30, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.60, box.y + box.height * 0.45, { steps: 8 });
  await page.mouse.up();
  await expect(inkPath(page)).toBeVisible();
  const original = await nativeInk(await save(page));
  expect(original.paths).toHaveLength(1);
  expect(original.paths[0].length).toBeGreaterThanOrEqual(6);

  await page.getByRole('tab', { name: 'Draw' }).click();
  await selectInk(page);
  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  const rotatedBytes = await save(page);
  const rotated = await nativeInk(rotatedBytes);
  expectPathsClose(rotated.paths, clockwise(original.paths, original.rect));
  expect(rotated.color).toBe(original.color);
  expect(rotated.opacity).toBe(original.opacity);

  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expectPathsClose((await nativeInk(await save(page))).paths, original.paths);
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expectPathsClose((await nativeInk(await save(page))).paths, rotated.paths);

  const context = await browser.newContext();
  try {
    const reopened = await context.newPage();
    await open(reopened, rotatedBytes);
    await selectInk(reopened);
    await reopened.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
    const second = await nativeInk(await save(reopened));
    expectPathsClose(second.paths, clockwise(rotated.paths, rotated.rect));
    expect(second.wrapped).toBe(true);
  } finally {
    await context.close();
  }
});
