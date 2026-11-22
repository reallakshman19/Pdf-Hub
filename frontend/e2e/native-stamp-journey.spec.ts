import { test, expect, type Page } from '@playwright/test';
import { decodePDFRawStream, degrees, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 } });

async function syntheticPdf(rotateTarget = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const second = doc.addPage([612, 792]);
  if (rotateTarget) second.setRotation(degrees(90));
  const stream = doc.context.flateStream('q 1 0 0 rg 0 0 120 30 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 120, 30], Resources: {},
  });
  const appearance = doc.context.register(stream);
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [250, 500, 350, 550], P: page.ref });
  const popupRef = doc.context.register(popup);
  const original = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', Rect: [100, 500, 220, 530],
    NM: PDFString.of('original-stamp'), P: page.ref, Popup: popupRef, AP: { N: appearance },
  }));
  popup.set(PDFName.of('Parent'), original);
  page.node.set(PDFName.of('Annots'), doc.context.obj([original, popupRef]));
  return doc.save();
}

async function open(page: Page, rotateTarget = false) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({ name: 'synthetic-stamp.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await syntheticPdf(rotateTarget)) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
}

async function savePdf(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  await download.delete();
  return PDFDocument.load(bytes);
}

async function savedStampCount(page: Page) {
  const pdf = await savePdf(page);
  const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  let stamps = 0;
  let appearances = 0;
  for (let i = 0; i < annots.size(); i += 1) {
    const annotation = annots.lookup(i, PDFDict);
    if (annotation.get(PDFName.of('Subtype'))?.toString() !== '/Stamp') continue;
    stamps += 1;
    if (annotation.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'))) appearances += 1;
  }
  return { stamps, appearances };
}

test('renders the actual imported stamp appearance in the editable overlay', async ({ page }) => {
  await open(page);
  const stamp = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  const appearance = stamp.locator('img[data-native-stamp-appearance]');
  await expect(appearance).toBeVisible();
  const pixel = await appearance.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
  });
  expect(pixel[0]).toBeGreaterThan(200);
  expect(pixel[1]).toBeLessThan(30);
  expect(pixel[2]).toBeLessThan(30);
  expect(pixel[3]).toBeGreaterThan(200);
  await stamp.click();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Copy annotation' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.getByRole('button', { name: 'Paste annotation' }).click();
  await expect(page.locator('[data-page="2"] img[data-native-stamp-appearance]')).toBeVisible();
});

test('explains which imported stamp artwork cannot be edited', async ({ page }) => {
  await open(page);
  await page.locator('[data-page="1"] [data-annotation-type="stamp"]').click();
  await expect(page.getByLabel('Text', { exact: true })).toBeDisabled();
  await page.getByTitle('Style', { exact: true }).click();
  await expect(page.getByText(/colors and wording cannot yet be edited/)).toBeVisible();
  await expect(page.getByLabel('Background', { exact: true })).toBeDisabled();
});

test('edits a new stamp, saves its native appearance, then reopens and edits it again', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Stamp', exact: true }).click();
  await page.locator('[data-page="1"]').click({ position: { x: 50, y: 100 } });
  const stamps = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await expect(stamps).toHaveCount(2);
  await page.getByTitle('Style', { exact: true }).click();
  await page.getByLabel('Background', { exact: true }).fill('#00ff00');
  await expect(stamps.last()).toHaveCSS('background-color', 'rgb(0, 255, 0)');
  await page.getByTitle('Properties', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Reviewed');
  await expect(stamps.last()).toContainText('Reviewed');
  const pdf = await savePdf(page);
  const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const created = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict))
    .find((item) => item.get(PDFName.of('Subtype'))?.toString() === '/Stamp'
      && item.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText() !== 'original-stamp')!;
  const normal = created.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
  if (!(normal instanceof PDFRawStream)) throw new Error('Expected a raw appearance stream');
  expect(new TextDecoder().decode(decodePDFRawStream(normal).decode())).toContain('0 1 0 rg');
  expect(created.lookup(PDFName.of('Contents'), PDFHexString, PDFString).decodeText()).toBe('Reviewed');
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await stubNativeFilePickers(reopened);
    await reopened.goto('./');
    const [picker] = await Promise.all([reopened.waitForEvent('filechooser'), reopened.getByRole('button', { name: 'Browse Files' }).click()]);
    await picker.setFiles({ name: 'edited-stamp.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    const stamp = reopened.locator('[data-page="1"] [data-annotation-type="stamp"]').last();
    await expect(stamp).toContainText('Reviewed');
    await stamp.click();
    await reopened.getByRole('textbox', { name: 'Text', exact: true }).fill('Approved Now');
    await expect(stamp).toContainText('Approved Now');
    const changed = await savePdf(reopened);
    const roots = changed.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const edited = Array.from({ length: roots.size() }, (_, i) => roots.lookup(i, PDFDict))
      .find((item) => item.lookupMaybe(PDFName.of('Contents'), PDFHexString, PDFString)?.decodeText() === 'Approved Now');
    expect(edited?.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  } finally { await fresh.close(); }
});

test('copies an imported stamp and popup independently to another page', async ({ page }) => {
  await open(page);
  const source = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await expect(source).toHaveCount(1);
  await source.click();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Copy annotation' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Paste annotation' }).click();
  await expect(page.locator('[data-page="2"] [data-annotation-type="stamp"]')).toHaveCount(1);
  const pdf = await savePdf(page);
  const roots = pdf.getPages().map((p) => p.node.lookup(PDFName.of('Annots'), PDFArray));
  for (const annots of roots) {
    const types = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict).get(PDFName.of('Subtype'))?.toString());
    expect(types.filter((type) => type === '/Stamp')).toHaveLength(1);
    expect(types.filter((type) => type === '/Popup')).toHaveLength(1);
  }
});

test('copies a stamp onto a rotated page with the same visible orientation and reopens it', async ({ page, browser }) => {
  await open(page, true);
  await page.locator('[data-page="1"] [data-annotation-type="stamp"]').click();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Copy annotation' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.getByRole('button', { name: 'Paste annotation' }).click();
  const copied = page.locator('[data-page="2"] [data-annotation-type="stamp"]');
  await expect(copied.locator('img[data-native-stamp-appearance]')).toBeVisible();
  const firstBox = await copied.boundingBox();
  expect(firstBox!.width / firstBox!.height).toBeCloseTo(4, 1);
  const output = await savePdf(page);
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await stubNativeFilePickers(reopened);
    await reopened.goto('./');
    const [picker] = await Promise.all([reopened.waitForEvent('filechooser'), reopened.getByRole('button', { name: 'Browse Files' }).click()]);
    await picker.setFiles({ name: 'rotated-page-copy.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await output.save()) });
    await reopened.getByRole('button', { name: /^Page 2\b/ }).click();
    const restored = reopened.locator('[data-page="2"] [data-annotation-type="stamp"]');
    await expect(restored.locator('img[data-native-stamp-appearance]')).toBeVisible();
    const restoredBox = await restored.boundingBox();
    expect(restoredBox!.width / restoredBox!.height).toBeCloseTo(4, 1);
  } finally { await fresh.close(); }
});

test('deleting an imported stamp removes its native popup, and undo restores both across save', async ({ page }) => {
  await open(page);
  const stamp = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await stamp.click();
  await page.keyboard.press('Delete');
  await expect(stamp).toHaveCount(0);
  let output = await savePdf(page);
  let annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(annots.size()).toBe(0);
  await page.keyboard.press('Control+z');
  await expect(stamp).toHaveCount(1);
  output = await savePdf(page);
  annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const types = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict).get(PDFName.of('Subtype'))?.toString()).sort();
  expect(types).toEqual(['/Popup', '/Stamp']);
});

test('adds, edits, deletes and undoes a comment on an imported stamp across saves', async ({ page }) => {
  await open(page);
  await page.locator('[data-page="1"] [data-annotation-type="stamp"]').click();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await page.getByLabel('Comment on selected annotation').fill('Check the location');
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByText('Check the location')).toBeVisible();
  let output = await savePdf(page);
  let annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const replyValues = (array: PDFArray) => Array.from({ length: array.size() }, (_, i) => array.lookup(i, PDFDict))
    .filter((dict) => dict.get(PDFName.of('PDFHubReplyId')))
    .map((dict) => dict.lookup(PDFName.of('Contents'), PDFHexString, PDFString).decodeText());
  expect(replyValues(annots)).toEqual(['Check the location']);
  await page.getByRole('button', { name: 'Edit comment', exact: true }).click();
  await page.getByLabel('Edit comment text').fill('Location confirmed');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page.getByText('Location confirmed')).toBeVisible();
  output = await savePdf(page);
  annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(replyValues(annots)).toEqual(['Location confirmed']);
  await page.getByRole('button', { name: 'Delete comment', exact: true }).click();
  await expect(page.getByText('Location confirmed')).toHaveCount(0);
  output = await savePdf(page);
  annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(replyValues(annots)).toEqual([]);
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Location confirmed')).toBeVisible();
  output = await savePdf(page);
  annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(replyValues(annots)).toEqual(['Location confirmed']);
});

test('rotates an imported stamp as a native appearance and reopens it', async ({ page, browser }) => {
  await open(page);
  const stamp = page.locator('[data-page="1"] [data-annotation-type="stamp"]');
  await expect(stamp).toHaveCount(1);
  await stamp.click();
  const rotation = page.getByLabel('Rotation', { exact: true });
  await expect(rotation).toBeVisible();
  await rotation.fill('90');
  await rotation.blur();
  await expect(stamp).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  const output = await savePdf(page);
  const annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const root = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict))
    .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
  const rect = root.lookup(PDFName.of('Rect'), PDFArray).asArray().map((n) => Math.round(Number(n.toString())));
  expect(rect).toEqual([145, 455, 175, 575]);
  const normal = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
  expect(normal).toBeDefined();
  const reopenedBytes = await output.save();
  const fresh = await browser.newContext();
  try {
    const reopened = await fresh.newPage();
    await stubNativeFilePickers(reopened);
    await reopened.goto('./');
    const [picker] = await Promise.all([
      reopened.waitForEvent('filechooser'), reopened.getByRole('button', { name: 'Browse Files' }).click(),
    ]);
    await picker.setFiles({ name: 'rotated.pdf', mimeType: 'application/pdf', buffer: Buffer.from(reopenedBytes) });
    await expect(reopened.locator('[data-page="1"] [data-annotation-type="stamp"]')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  } finally { await fresh.close(); }
});

test('rotates a page with its imported stamp and preserves native coordinates after save', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
  await expect(page.locator('[data-page="1"] [data-annotation-type="stamp"]')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)', { timeout: 30_000 });
  const output = await savePdf(page);
  expect(output.getPage(0).getRotation().angle).toBe(90);
  const annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const root = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict))
    .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
  expect(root.lookup(PDFName.of('Rect'), PDFArray).asArray().map((value) => Number(value.toString()))).toEqual([100, 500, 220, 530]);
  expect(root.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
});

test('copy, save, rotate the destination page, and save again preserves the copied native stamp', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.locator('[data-page="1"] [data-annotation-type="stamp"]').click();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Copy annotation' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.getByRole('button', { name: 'Paste annotation' }).click();
  await expect(page.locator('[data-page="2"] [data-annotation-type="stamp"]')).toHaveCount(1);
  const before = await savePdf(page);
  const findStamp = (pdf: PDFDocument) => {
    const annots = pdf.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
    return Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict))
      .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
  };
  const beforeRect = findStamp(before).lookup(PDFName.of('Rect'), PDFArray).toString();
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.getByRole('button', { name: 'Rotate selected or current pages' }).click();
  await expect.poll(async () => {
    const box = await page.locator('[data-page="2"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(1);
  await expect(page.locator('[data-page="2"] [data-annotation-type="stamp"]')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  const after = await savePdf(page);
  expect(after.getPage(1).getRotation().angle).toBe(90);
  expect(findStamp(after).lookup(PDFName.of('Rect'), PDFArray).toString()).toBe(beforeRect);
  expect(findStamp(after).lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => {
    const box = await page.locator('[data-page="2"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeLessThan(1);
  const undone = await savePdf(page);
  expect(undone.getPage(1).getRotation().angle).toBe(0);
  expect(findStamp(undone).lookup(PDFName.of('Rect'), PDFArray).toString()).toBe(beforeRect);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => {
    const box = await page.locator('[data-page="2"] canvas').boundingBox();
    return box ? box.width / box.height : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(1);
  const redone = await savePdf(page);
  expect(redone.getPage(1).getRotation().angle).toBe(90);
  expect(findStamp(redone).lookup(PDFName.of('Rect'), PDFArray).toString()).toBe(beforeRect);
});

test('a copied native stamp survives deletion of its source page', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.locator('[data-page="1"] [data-annotation-type="stamp"]').click();
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Copy annotation' }).click();
  await page.getByRole('button', { name: /^Page 2\b/ }).click();
  await page.getByRole('button', { name: 'Paste annotation' }).click();
  await expect(page.locator('[data-page="2"] [data-annotation-type="stamp"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Organize' }).click();
  await page.getByRole('button', { name: /^Page 1\b/ }).click();
  await page.getByRole('button', { name: 'Delete selected or current pages' }).click();
  await expect(page.getByLabel('Page 1 of 1')).toBeVisible({ timeout: 30_000 });
  const output = await savePdf(page);
  expect(output.getPageCount()).toBe(1);
  const annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const roots = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict));
  const stamps = roots.filter((root) => root.get(PDFName.of('Subtype'))?.toString() === '/Stamp');
  expect(stamps).toHaveLength(1);
  expect(stamps[0].lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))).toBeDefined();
  expect(roots.filter((root) => root.get(PDFName.of('Subtype'))?.toString() === '/Popup')).toHaveLength(1);
});

for (const position of [{ x: 50, y: 100 }, { x: 150, y: 275 }]) {
  test(`placing a stamp at ${position.x},${position.y} saves a new native appearance`, async ({ page }) => {
    await open(page);
    const surface = page.locator('[data-page="1"]');
    const stampNodes = surface.locator('[data-annotation-type="stamp"]');
    await expect(stampNodes).toHaveCount(1);
    await page.getByRole('tab', { name: 'Annotate' }).click();
    await page.getByRole('button', { name: 'Stamp', exact: true }).click();
    await surface.click({ position });
    await expect(stampNodes).toHaveCount(2);
    expect(await savedStampCount(page)).toEqual({ stamps: 2, appearances: 2 });
  });
}
