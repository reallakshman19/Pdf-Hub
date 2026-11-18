import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs/promises';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

/**
 * ALT-WP-01 Stage-2 browser contract. Uses only the real user-visible
 * Browse Files → selection/Annotate → File Save pipeline. No product stores,
 * commands, or PDF writer are mocked or mutated by this script.
 *
 * These synthetic UI witnesses supplement, NOT replace, the frozen F01/F02
 * Stage-1 package and its independent native pypdf/PyMuPDF oracle.
 */
type Mark = 'Highlight' | 'Underline' | 'Strikeout' | 'Squiggly';

async function inputPdf(rotate = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  if (rotate) page.setRotation(degrees(rotate));
  page.drawText('ALPHA VALVE 10 BAR', { x: 72, y: 680, font, size: 12 });
  page.drawText('ANCHOR', { x: 72, y: 620, font, size: 12 });
  return new Uint8Array(await doc.save());
}

async function open(page: Page, bytes: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: 'alt-wp01-native-witness.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-page="1"] [data-text-item="true"]').first()).toBeVisible({ timeout: 30_000 });
}

async function zoom(page: Page, target: 100 | 150) {
  const zoomLabel = page.locator('span').filter({ hasText: /^(25|50|75|100|125|150|200|300|400)%$/ }).first();
  for (let step = 0; step < 10; step++) {
    const value = Number(((await zoomLabel.textContent()) ?? '').replace('%',''));
    if (value === target) return;
    const buttons = zoomLabel.locator('..').locator('button');
    await buttons.nth(value < target ? 1 : 0).click();
    await expect(zoomLabel).not.toHaveText(String(value) + '%');
  }
  throw new Error('Zoom control did not settle');
}

async function mouseSelect(page: Page, term: string) {
  const pageSurface = page.locator('[data-page="1"]');
  const bbox = await pageSurface.evaluate((root, needle) => {
    for (const span of root.querySelectorAll<HTMLSpanElement>('[data-text-item="true"]')) {
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const offset = (node.textContent ?? '').indexOf(needle);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + needle.length);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right, y: r.top + r.height / 2 };
    }
    return null;
  }, term);
  if (!bbox) throw new Error('Expected PDF text span missing: ' + term);
  await page.mouse.move(bbox.left + 1, bbox.y);
  await page.mouse.down();
  await page.mouse.move(bbox.right + 1, bbox.y, { steps: 14 });
  await page.mouse.up();
  const selected = (await page.evaluate(() => window.getSelection()?.toString() ?? '')).trim();
  expect(selected, 'Source PDF text selection must be word-exact, never adjacent words').toBe(term);
}

async function save(page: Page, info: TestInfo): Promise<Uint8Array> {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  const target = info.outputPath('emitted-native.pdf');
  await download.saveAs(target);
  await info.attach('emitted-native-pdf', { path: target, contentType: 'application/pdf' });
  const bytes = new Uint8Array(await fs.readFile(target));
  expect(Buffer.from(bytes).subarray(0, 5).toString('ascii')).toBe('%PDF-');
  return bytes;
}

function readNative(bytes: Uint8Array) {
  return PDFDocument.load(bytes).then((doc) => {
    const page = doc.getPage(0);
    const arr = page.node.lookup(PDFName.of('Annots'), PDFArray);
    expect(arr.size()).toBeGreaterThanOrEqual(1);
    const root = arr.lookup(0, PDFDict);
    const rect = root.lookup(PDFName.of('Rect'), PDFArray);
    const subtype = root.lookup(PDFName.of('Subtype'), PDFName).decodeText();
    const ap = root.lookup(PDFName.of('AP'), PDFDict);
    expect(ap, 'native /AP must exist').toBeTruthy();
    const form = ap.lookup(PDFName.of('N')) as { dict?: PDFDict };
    expect(form?.dict?.lookup(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('Form');
    const xy = Array.from({ length: rect.size() }, (_, idx) => Number(rect.lookup(idx).toString()));
    expect(xy[2]).toBeGreaterThan(xy[0]);
    expect(xy[3]).toBeGreaterThan(xy[1]);
    return { doc, subtype, root, rect: xy, form };
  });
}

for (const mark of ['Highlight', 'Underline', 'Strikeout', 'Squiggly'] as Mark[]) {
  for (const target of [100, 150] as const) {
    test('ALT WP01 ' + mark + ' selected-word native /AP and geometry at ' + target + '%', async ({ page, browser }, info) => {
      await open(page, await inputPdf());
      await zoom(page, target);
      await page.getByRole('tab', { name: 'View' }).click();
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      await mouseSelect(page, 'ALPHA VALVE');
      await page.locator('[data-page="1"]').getByRole('button', { name: mark, exact: true }).click();
      const saved = await save(page, info);
      const native = await readNative(saved);
      expect(native.subtype).toBe(mark === 'Strikeout' ? 'StrikeOut' : mark);
      // Original source line includes 10 BAR. Native markup must not mark the
      // trailing words (frozen F01 word oracle remains independently required).
      const fullWord = 'ALPHA VALVE 10 BAR';
      const original = await PDFDocument.create();
      const font = await original.embedFont(StandardFonts.Helvetica);
      const word = font.widthOfTextAtSize('ALPHA VALVE', 12);
      const full = font.widthOfTextAtSize(fullWord, 12);
      expect(native.rect[2] - native.rect[0]).toBeLessThan(full - 4);
      expect(Math.abs((native.rect[2] - native.rect[0]) - word)).toBeLessThan(8);
      // Re-open via real picker in a fresh browser context: no IndexedDB cache.
      const context = await browser.newContext({ acceptDownloads: true });
      try {
        const reopen = await context.newPage();
        await open(reopen, saved);
        await expect(reopen.locator('[data-page="1"]')).toBeVisible();
        const [reopenSave] = await Promise.all([
          reopen.waitForEvent('download'),
          (async () => {
            await reopen.getByRole('tab', { name: 'File' }).click();
            await reopen.getByRole('button', { name: 'Save', exact: true }).click();
          })(),
        ]);
        const second = new Uint8Array(await fs.readFile((await reopenSave.path())!));
        const checked = await readNative(second);
        expect(checked.subtype).toBe(native.subtype);
        expect(checked.rect).toEqual(native.rect);
      } finally {
        await context.close();
      }
    });
  }
}

test('ALT WP01 rotated 90deg native markup anchors actual source page text', async ({ page }, info) => {
  await open(page, await inputPdf(90));
  await page.getByRole('tab', { name: 'View' }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await mouseSelect(page, 'ANCHOR');
  await page.locator('[data-page="1"]').getByRole('button', { name: 'Highlight', exact: true }).click();
  const saved = await save(page, info);
  const native = await readNative(saved);
  expect(native.subtype).toBe('Highlight');
  // Independent source placement in PDF user coordinates: input "ANCHOR"
  // starts x=72, baseline y=620. Rotation only changes screen orientation.
  expect(native.rect[0]).toBeGreaterThan(60);
  expect(native.rect[0]).toBeLessThan(115);
  expect(native.rect[1]).toBeGreaterThan(595);
  expect(native.rect[3]).toBeLessThan(635);
});

test('ALT WP01 visual mask is Square AP, not redaction; source text survives', async ({ page }, info) => {
  await open(page, await inputPdf());
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: /Visual Mask/ }).click();
  const b = await page.locator('[data-page="1"]').boundingBox();
  if (!b) throw Error('No page surface');
  await page.mouse.move(b.x + 70, b.y + 92);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 125, { steps: 12 });
  await page.mouse.up();
  const saved = await save(page, info);
  const native = await readNative(saved);
  expect(native.subtype).toBe('Square');
  expect(native.subtype).not.toBe('Redact');
  // PDF.js independently reads the user-extractable source text from
  // the emitted PDF. The separate PyMuPDF/pypdf audit remains mandatory.
  const parsed = await getDocument({ data: saved.slice() }).promise;
  const extracted = await (await parsed.getPage(1)).getTextContent();
  expect(extracted.items.map((item) => 'str' in item ? item.str : '').join(' ')).toContain('ALPHA VALVE');
  await parsed.destroy();
});
