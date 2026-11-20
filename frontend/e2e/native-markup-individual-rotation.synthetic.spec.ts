import { expect, test, type Page } from '@playwright/test';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function fixture(destinationRotation = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]); page.setCropBox(25, 30, 300, 400);
  const dest = doc.addPage([400, 500]); dest.setCropBox(25, 30, 300, 400); dest.setRotation(degrees(destinationRotation));
  // Asymmetric native artwork: a blue underline and a red square near one end.
  const appearance = doc.context.register(doc.context.flateStream('q 0 0 1 RG 2 w 0 3.4 m 100 3.4 l S 1 0 0 rg 2 8 8 8 re f Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20], Resources: {} }));
  const root = doc.context.obj({ Type: 'Annot', Subtype: 'Underline', NM: PDFString.of('synthetic-underline'), P: page.ref,
    Rect: [100, 100, 200, 120], QuadPoints: [100, 120, 200, 120, 100, 100, 200, 100], AP: { N: appearance } });
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(root)]));
  return doc.save();
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page); await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-underline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 60_000 });
}

async function zoom125(page: Page) {
  const label = page.locator('span').filter({ hasText: /^(25|50|75|100|125|150|200|300|400)%$/ }).first();
  for (let i = 0; i < 10; i++) {
    const current = Number(((await label.textContent()) ?? '').replace('%', ''));
    if (current === 125) return;
    await label.locator('..').locator('button').nth(current < 125 ? 1 : 0).click();
    await expect(label).not.toHaveText(`${current}%`);
  }
  throw new Error('Zoom did not reach 125%');
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete(); return new Uint8Array(Buffer.concat(chunks));
}

async function expectVerticalLine(page: Page, pageNumber: number) {
  const annotation = page.locator(`[data-page="${pageNumber}"] [data-annotation-type="underline"]`).first();
  await expect(annotation).toBeVisible();
  const line = annotation.locator('svg line').first();
  await expect(line).toHaveCount(1);
  const coords = await line.evaluate((element) => ['x1', 'y1', 'x2', 'y2'].map((name) => Number(element.getAttribute(name))));
  expect(coords[0]).toBeCloseTo(coords[2], 4);
  expect(coords[3] - coords[1]).toBeCloseTo(125, 2);
  expect(coords[0]).toBeCloseTo(4.25, 2);
}

test('turns native underline, saves, reopens and copies its appearance', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const input = await fixture();
  await open(page, input); await zoom125(page);
  await page.locator('[data-page="1"] [data-annotation-type="underline"]').click();
  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  await expectVerticalLine(page, 1);
  const output = await save(page);
  const saved = await PDFDocument.load(output);
  const root = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const array = (key: string) => root.lookup(PDFName.of(key), PDFArray).asArray().map((value) => Number(value.toString()));
  expect(array('Rect')).toEqual([140, 60, 160, 160]);
  expect(array('QuadPoints')).toEqual([160, 160, 160, 60, 140, 160, 140, 60]);
  expect(root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).dict.get(PDFName.of('PDFHubWrappedOriginal'))).toBeDefined();
  const proofDir = process.env.WP01_SYNTHETIC_MARKUP_PROOF_DIR;
  if (proofDir) {
    await fs.mkdir(proofDir, { recursive: true });
    await fs.writeFile(path.join(proofDir, 'synthetic-underline-source.pdf'), input);
    await fs.writeFile(path.join(proofDir, 'synthetic-underline-rotated.pdf'), output);
  }
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage(); await open(reopened, output); await zoom125(reopened);
    await expectVerticalLine(reopened, 1);
    await reopened.locator('[data-page="1"] [data-annotation-type="underline"]').click();
    await reopened.keyboard.press('Control+c');
    await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
    await reopened.keyboard.press('Control+v');
    await expectVerticalLine(reopened, 2);
    const copied = await PDFDocument.load(await save(reopened));
    const copy = copied.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(copy.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream)).toBeDefined();
  } finally { await fresh.close(); }
});

for (const destinationRotation of [0, 90]) {
  test(`copies a pending rotated underline to a ${destinationRotation} degree page before saving`, async ({ page, browser }) => {
    test.setTimeout(180_000);
    const input = await fixture(destinationRotation);
    await open(page, input); await zoom125(page);
    await page.locator('[data-page="1"] [data-annotation-type="underline"]').click();
    await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
    await expectVerticalLine(page, 1);
    await page.keyboard.press('Control+c');
    await page.getByRole('button', { name: /^Page 2\b/ }).click();
    await page.keyboard.press('Control+v');
    await expectVerticalLine(page, 2);
    const output = await save(page);
    const pdf = await PDFDocument.load(output);
    for (const index of [0, 1]) {
      const annotation = pdf.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
      expect(annotation.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream)).toBeDefined();
      expect(annotation.lookup(PDFName.of('QuadPoints'), PDFArray).size()).toBe(8);
    }
    const proofDir = process.env.WP01_SYNTHETIC_MARKUP_PROOF_DIR;
    if (proofDir) {
      await fs.mkdir(proofDir, { recursive: true });
      await fs.writeFile(path.join(proofDir, `synthetic-pending-copy-${destinationRotation}.pdf`), output);
    }
    const fresh = await browser.newContext();
    try {
      const reopened = await fresh.newPage(); await open(reopened, output); await zoom125(reopened);
      await expectVerticalLine(reopened, 1);
      await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
      await expectVerticalLine(reopened, 2);
    } finally { await fresh.close(); }
  });
}

test('creates, turns and copies a squiggly before its first save on differently rotated pages', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const doc = await PDFDocument.create();
  const first = doc.addPage([400, 500]); first.setCropBox(25, 30, 300, 400); first.setRotation(degrees(90));
  const second = doc.addPage([400, 500]); second.setCropBox(25, 30, 300, 400);
  await open(page, await doc.save()); await zoom125(page);
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Squiggly/ }).click();
  const canvas = page.locator('[data-page="1"] canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(); if (!box) throw new Error('Synthetic page is not visible');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.36, { steps: 8 });
  await page.mouse.up();
  const squiggle = (number: number) => page.locator(`[data-page="${number}"] [data-annotation-type="squiggly"]`).first();
  await expect(squiggle(1)).toBeVisible();
  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  await expect(squiggle(1).locator('svg path').first()).toHaveAttribute('transform', /rotate\(90\)/);
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.keyboard.press('Control+v');
  await expect(squiggle(2)).toBeVisible();
  await expect(squiggle(2).locator('svg path').first()).toHaveAttribute('transform', /rotate\(90\)/);
  const output = await save(page);
  const saved = await PDFDocument.load(output);
  for (const index of [0, 1]) {
    const annotation = saved.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(annotation.get(PDFName.of('Subtype'))?.toString()).toBe('/Squiggly');
    expect(annotation.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream)).toBeDefined();
  }
  const proofDir = process.env.WP01_SYNTHETIC_MARKUP_PROOF_DIR;
  if (proofDir) {
    await fs.mkdir(proofDir, { recursive: true });
    await fs.writeFile(path.join(proofDir, 'synthetic-new-squiggle-copy.pdf'), output);
  }
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage(); await open(reopened, output); await zoom125(reopened);
    await expect(reopened.locator('[data-page="1"] [data-annotation-type="squiggly"] svg path').first())
      .toHaveAttribute('transform', /rotate\(90\)/);
    await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
    await expect(reopened.locator('[data-page="2"] [data-annotation-type="squiggly"] svg path').first())
      .toHaveAttribute('transform', /rotate\(90\)/);
  } finally { await fresh.close(); }
});
