import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

async function source() {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([612, 792]);
  // Editable foreign FreeText contains both its original vector graphics
  // and text operators. A form containing graphics *only* cannot safely
  // undergo rich-text substitution: the writer rightly rejects it.
  const font = pdf.context.register(pdf.context.obj({
    Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica',
  }));
  const appearance = pdf.context.register(pdf.context.flateStream(
    'q 0 0.7 0 rg 0 0 150 40 re f Q q BT /F1 9 Tf 4 4 Td (Imported rich callout) Tj ET Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 40],
      Resources: { Font: { F1: font } } },
  ));
  const callout = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout',
    NM: PDFString.of('imported-rich-callout'), P: sheet.ref,
    Rect: [60, 520, 210, 560], RD: [30, 0, 0, 0],
    CL: [60, 540, 90, 540], Contents: PDFString.of('Imported rich callout'),
    RC: PDFString.of('<body><p>Imported rich callout</p></body>'),
    DA: PDFString.of('/Helv 14 Tf 0 g'), AP: { N: appearance },
  }));
  const line = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Line', NM: PDFString.of('imported-line'),
    P: sheet.ref, Rect: [240, 450, 390, 490],
    L: [240, 470, 390, 470], AP: { N: appearance },
  }));
  sheet.node.set(PDFName.of('Annots'), pdf.context.obj([callout, line]));
  return new Uint8Array(await pdf.save());
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({ name: 'synthetic-native-AP.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });
}

async function save(page: Page) {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing PDF download stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

test('source AP callout and line stay visible, selectable and native after save/reopen', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await open(page, await source());

  const callout = page.locator('[data-page="1"] [data-native-annotation-id="imported-rich-callout"]');
  const line = page.locator('[data-page="1"] [data-native-annotation-id="imported-line"]');
  await expect(callout.locator('img[data-native-annotation-appearance]')).toBeVisible({ timeout: 25_000 });
  await expect(line.locator('img[data-native-annotation-appearance]')).toBeVisible();

  const image = callout.locator('img[data-native-annotation-appearance]');
  // The fixture's own /AP paints a solid green rectangle; this must be the
  // actual native stream, not a generic HTML FreeText preview.
  const pixel = await image.evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) throw new Error('Empty source AP');
    context.drawImage(element, 0, 0);
    return Array.from(context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
  });
  expect(pixel[0]).toBeLessThan(60);
  expect(pixel[1]).toBeGreaterThan(120);
  expect(pixel[2]).toBeLessThan(60);
  expect(pixel[3]).toBeGreaterThan(200);

  const body = callout.locator('[data-native-annotation-hit-target]');
  const bounds = await Promise.all([image.boundingBox(), body.boundingBox()]);
  if (!bounds[0] || !bounds[1]) throw new Error('Missing imported appearance or editor bounds');
  expect(bounds[0].width).toBeGreaterThan(bounds[1].width);
  expect(bounds[0].x).toBeLessThan(bounds[1].x);

  await body.click();
  await expect(page.getByText('Native rich text', { exact: true })).toBeVisible();
  await line.locator('[data-native-annotation-hit-target]').click();
  await expect(line.locator('.cursor-se-resize')).toBeVisible();

  const output = await save(page);
  const saved = await PDFDocument.load(output);
  const annots = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const roots = Array.from({ length: annots.size() }, (_, index) => annots.lookup(index, PDFDict));
  expect(roots.some((dict) => dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'FreeText'
    && dict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))).toBe(true);
  expect(roots.some((dict) => dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'Line'
    && dict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))).toBe(true);

  const context = await browser.newContext();
  try {
    const reopened = await context.newPage();
    await open(reopened, output);
    const reopenedCallout = reopened.locator('[data-native-annotation-id="imported-rich-callout"]');
    await expect(reopenedCallout.locator('img[data-native-annotation-appearance]')).toBeVisible();
    await reopenedCallout.locator('[data-native-annotation-hit-target]').click();
    await expect(reopened.getByText('Native rich text', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('editing imported rich FreeText survives refresh, drops stale preview and stays native on Save', async ({ page }) => {
  test.setTimeout(100_000);
  const bytes = await source();
  await open(page, bytes);
  const callout = page.locator('[data-native-annotation-id="imported-rich-callout"]');
  const body = callout.locator('[data-native-annotation-hit-target]');
  await expect(callout.locator('img[data-native-annotation-appearance]')).toBeVisible();

  await body.dblclick();
  const editor = body.locator('textarea');
  await expect(editor).toBeVisible();
  await editor.fill('Updated native callout');
  await editor.press('Control+Enter');

  await expect(callout.locator('img[data-native-annotation-appearance]')).toHaveCount(0);
  // Wait for the actual asynchronous IndexedDB commit. Sleeping and hoping
  // the 400ms debounce completed would make refresh recovery a flaky test.
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('DocCraftAnnotations');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('annotations', 'readonly');
    const query = tx.objectStore('annotations').getAll();
    const rows = await new Promise<Array<{
      annotations?: Array<{ id: string; data?: { text?: string } }>;
    }>>((resolve, reject) => {
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    db.close();
    return rows.some((row) => row.annotations?.some((item) =>
      item.id === 'imported-rich-callout' && item.data?.text === 'Updated native callout'));
  }), { timeout: 15_000 }).toBe(true);

  // Reopen the *same source bytes*. Hydration must respect the user's
  // revision-bound edit provenance rather than replacing text from /Contents.
  await open(page, bytes);
  const recovered = page.locator('[data-native-annotation-id="imported-rich-callout"]');
  await expect(recovered.locator('img[data-native-annotation-appearance]')).toHaveCount(0);
  const recoveredBody = recovered.locator('[data-native-annotation-hit-target]');
  await recoveredBody.dblclick();
  await expect(recoveredBody.locator('textarea')).toHaveValue('Updated native callout');
  await recoveredBody.locator('textarea').press('Control+Enter');

  const saved = await PDFDocument.load(await save(page));
  const annots = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const calloutDict = Array.from({ length: annots.size() }, (_, index) => annots.lookup(index, PDFDict))
    .find((dict) => dict.get(PDFName.of('Subtype'))?.toString() === '/FreeText')!;
  expect(calloutDict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString)?.decodeText()).toBe('Updated native callout');
  expect(calloutDict.get(PDFName.of('RC'))).toBeDefined();
  expect(calloutDict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'))).toBeDefined();
  // Re-entering the editor after refresh must not silently auto-size a
  // source-native rich text body or rebase its appearance/leader geometry.
  const sourcePdf = await PDFDocument.load(bytes);
  const sourceAnnot = sourcePdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    .lookup(0, PDFDict);
  for (const field of ['Rect', 'RD', 'CL', 'DA', 'IT']) {
    expect(calloutDict.get(PDFName.of(field))?.toString(),
      `Native ${field} was changed by a text-only edit`)
      .toBe(sourceAnnot.get(PDFName.of(field))?.toString());
  }
});

test('native deletion survives a new admission of the original PDF only with a durable issued command', async ({ page }) => {
  test.setTimeout(110_000);
  const bytes = await source();
  await open(page, bytes);
  const line = page.locator('[data-native-annotation-id="imported-line"]');
  await expect(line.locator('[data-native-annotation-hit-target]')).toBeVisible();
  await line.locator('[data-native-annotation-hit-target]').click();
  await page.keyboard.press('Delete');
  await expect(line).toHaveCount(0);

  // Verify the independent transaction journal contains the user-issued
  // deletion, not merely a plausible tombstone inside the mutable sidecar.
  await expect.poll(async () => page.evaluate(async () => {
    const openReq = indexedDB.open('pdf-hub-history-journal-browser-history-journal-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => reject(openReq.error);
    });
    const tx = db.transaction('manifests', 'readonly');
    const req = tx.objectStore('manifests').getAll();
    const rows = await new Promise<Array<{
      entries?: Array<{ nativeMutations?: Array<{ kind: string; sourceName: string }> }>;
    }>>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((row) => row.entries?.some((entry) =>
      entry.nativeMutations?.some((mutation) =>
        mutation.kind === 'DELETE' && mutation.sourceName === 'imported-line')));
  }), { timeout: 20_000 }).toBe(true);

  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('DocCraftAnnotations');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('annotations', 'readonly');
    const req = tx.objectStore('annotations').getAll();
    const rows = await new Promise<Array<{ nativeDeletionTombstones?: Array<{ sourceName: string }> }>>(
      (resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    db.close();
    return rows.some((row) => row.nativeDeletionTombstones?.some((item) =>
      item.sourceName === 'imported-line'));
  }), { timeout: 20_000 }).toBe(true);

  // A new Open creates a fresh journal, so the event must be recovered from
  // the preceding durable journal, not the new in-memory Undo stack.
  await open(page, bytes);
  await expect(page.locator('[data-native-annotation-id="imported-line"]')).toHaveCount(0);
  const output = await PDFDocument.load(await save(page));
  const annots = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  const names = Array.from({ length: annots.size() }, (_, i) =>
    annots.lookup(i, PDFDict).lookupMaybe(PDFName.of('NM'), PDFString, PDFHexString)?.decodeText());
  expect(names).toContain('imported-rich-callout');
  expect(names).not.toContain('imported-line');
});

test('forged cached native geometry cannot gain Save authority by fabricating provenance', async ({ page }) => {
  test.setTimeout(90_000);
  const bytes = await source();
  await open(page, bytes);
  await expect(page.locator('[data-native-annotation-id="imported-line"]')).toBeVisible();

  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('DocCraftAnnotations');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('annotations', 'readonly');
    const req = tx.objectStore('annotations').getAll();
    const rows = await new Promise<Array<{
      annotations?: Array<{ id: string; data?: { geometryVersion?: number } }>;
    }>>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((row) => row.annotations?.some((item) =>
      item.id === 'imported-line' && item.data?.geometryVersion === 2));
  }), { timeout: 15_000 }).toBe(true);

  // Change only the recovery sidecar. No annotation command or durable history
  // entry was issued by the application.
  const forgedCount = await page.evaluate(async () => {
    const request = indexedDB.open('DocCraftAnnotations');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const req = store.getAll();
    const rows = await new Promise<Array<{
      id: string;
      annotations: Array<{
        id: string;
        rect: { x: number; y: number; width: number; height: number };
        data: { nativeSourceRef?: string; nativeEditProvenance?: unknown };
      }>;
    }>>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    let forged = 0;
    for (const row of rows) {
      const target = row.annotations.find((item) => item.id === 'imported-line');
      if (!target?.data.nativeSourceRef) continue;
      target.rect.x += 90;
      target.data.nativeEditProvenance = {
        sourceRevision: row.id, sourceRef: target.data.nativeSourceRef,
        commandId: 'plausible-but-never-issued',
        fields: ['rect'],
      };
      store.put(row);
      forged += 1;
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return forged;
  });
  expect(forgedCount).toBe(1);

  await open(page, bytes);
  await expect(page.getByText('Native annotation recovery incomplete')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'File' }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
