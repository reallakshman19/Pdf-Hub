import { expect, test } from '@playwright/test';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' });

for (const rotation of [0, 90, 180, 270]) {
test(`dragging a note at page rotation ${rotation} persists its native location`, async ({ page }) => {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([400, 500]);
  sheet.setRotation(degrees(rotation));
  const note = doc.context.obj({ Type: 'Annot', Subtype: 'Text', PDFHubType: PDFString.of('comment'),
    NM: PDFString.of('note'), Contents: PDFString.of('synthetic'), Rect: [60, 300, 100, 320], P: sheet.ref });
  sheet.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(note)]));
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Browse Files' }).click()]);
  await picker.setFiles({ name: 'synthetic-note.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  const element = page.locator('[data-page="1"] [data-annotation-type="comment"]');
  await expect(element).toBeVisible();
  const canvasElement = page.locator('[data-page="1"] canvas');
  await expect(canvasElement).toBeVisible();
  // Selecting can open the inspector and move the page. Let Playwright wait for
  // the note to be actionable, select it, and then measure the drag in page
  // coordinates rather than treating workspace movement as note movement.
  await element.click({ position: { x: 5, y: 5 } });
  await element.hover({ position: { x: 5, y: 5 } });
  // Native interaction evidence: record actual pointer and compatibility mouse
  // events without mocking application movement or mutating annotation state.
  await page.evaluate(() => {
    const trace: Array<{ type: string; x: number; y: number; annotation: string | null }> = [];
    (window as Window & { __wp01NoteDragTrace?: typeof trace }).__wp01NoteDragTrace = trace;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mousemove', 'mouseup']) {
      window.addEventListener(type, (event) => {
        if (trace.length >= 60) return;
        const target = event.target instanceof Element ? event.target.closest('[data-annotation-type]') : null;
        const mouse = event as MouseEvent;
        trace.push({
          type, x: mouse.clientX, y: mouse.clientY,
          annotation: target?.getAttribute('data-annotation-type') ?? null,
        });
      }, { capture: true });
    }
  });
  const before = await element.boundingBox();
  const canvasBefore = await canvasElement.boundingBox();
  if (!before || !canvasBefore) throw new Error('Note or page has no display bounds');
  await page.mouse.move(before.x + 5, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(before.x + 25, before.y + 17, { steps: 4 });
  await page.mouse.up();
  const after = await element.boundingBox();
  const canvasAfter = await canvasElement.boundingBox();
  if (!after || !canvasAfter) throw new Error('Note or page disappeared after dragging');
  const viewDeltaX = (after.x - canvasAfter.x) - (before.x - canvasBefore.x);
  const viewDeltaY = (after.y - canvasAfter.y) - (before.y - canvasBefore.y);
  const trace = await page.evaluate(() =>
    (window as Window & { __wp01NoteDragTrace?: Array<{
      type: string; x: number; y: number; annotation: string | null;
    }> }).__wp01NoteDragTrace ?? [],
  );
  process.stdout.write('WP01_NOTE_DRAG_TRACE ' + JSON.stringify({
    rotation, viewDeltaX, viewDeltaY,
    before, after, canvasBefore, canvasAfter,
    trace,
  }) + '\n');
  expect(Math.abs(viewDeltaX - 20)).toBeLessThan(2);
  expect(Math.abs(viewDeltaY - 12)).toBeLessThan(2);
  const scale = canvasAfter.width / (rotation % 180 === 0 ? 400 : 500);
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  const saved = await PDFDocument.load(Buffer.concat(chunks));
  const dict = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const rect = dict.lookup(PDFName.of('Rect'), PDFArray);
  const values = Array.from({ length: rect.size() }, (_, index) => rect.lookup(index, PDFNumber).asNumber());
  const viewX = viewDeltaX / scale;
  const viewY = viewDeltaY / scale;
  const [dx, dy] = rotation === 0 ? [viewX, -viewY] : rotation === 90 ? [viewY, viewX]
    : rotation === 180 ? [-viewX, viewY] : [-viewY, -viewX];
  [60 + dx, 300 + dy, 100 + dx, 320 + dy].forEach((value, index) => {
    expect(Math.abs(values[index] - value)).toBeLessThan(1);
  });
});
}
