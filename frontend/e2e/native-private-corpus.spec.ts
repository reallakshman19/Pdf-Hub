import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

interface CorpusEntry {
  path: string;
  /** Number of imported, interactive annotation roots on each page. */
  pages: number[];
  /** Optional number of source-AP images expected on each page. */
  apImages?: number[];
}

function privateManifest(): CorpusEntry[] {
  const path = process.env.PDFHUB_NATIVE_CORPUS_MANIFEST;
  if (!path) return [];
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(value)) throw new Error('Expected an array of private corpus entries');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid private corpus entry');
    const row = item as Record<string, unknown>;
    if (typeof row.path !== 'string' || !Array.isArray(row.pages)
      || !row.pages.every((n) => Number.isInteger(n) && n >= 0)) {
      throw new Error('Each corpus entry requires a PDF path and per-page native annotation counts');
    }
    if (row.apImages !== undefined && (!Array.isArray(row.apImages)
      || row.apImages.length !== row.pages.length
      || !row.apImages.every((n) => Number.isInteger(n) && n >= 0))) {
      throw new Error('apImages must supply nonnegative counts for every page');
    }
    return { path: row.path, pages: row.pages, apImages: row.apImages } as CorpusEntry;
  });
}

test.use({ viewport: { width: 1600, height: 900 }, trace: 'off' });
const corpus = privateManifest();
if (corpus.length === 0) {
  test.skip('private native corpus requires PDFHUB_NATIVE_CORPUS_MANIFEST', () => {});
}

async function open(page: Page, path: string, contents?: Uint8Array) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: basename(path),
    mimeType: 'application/pdf',
    buffer: contents ? Buffer.from(contents) : readFileSync(path),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 60_000 });
}

async function downloadPdf(page: Page, name: string): Promise<Uint8Array> {
  await page.getByRole('tab', { name: 'File' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Could not read ${name} PDF download`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await download.delete();
  return new Uint8Array(Buffer.concat(chunks));
}

function assertNativeRoots(pdf: PDFDocument, expected: number[]) {
  expect(pdf.getPageCount()).toBe(expected.length);
  for (const [index, count] of expected.entries()) {
    const annots = pdf.getPage(index).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    const roots = annots ? Array.from({ length: annots.size() }, (_, j) => annots.lookup(j, PDFDict))
      .filter((dict) => dict.get(PDFName.of('Subtype'))?.toString() !== '/Popup'
        && !dict.get(PDFName.of('IRT'))) : [];
    expect(roots, `Page ${index + 1} native annotation count`).toHaveLength(count);
    for (const dict of roots) {
      expect(dict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')),
        `Page ${index + 1} has a missing native appearance`).toBeDefined();
    }
  }
}

for (const entry of corpus) {
  test(`private native source: ${basename(entry.path)}`, async ({ page }) => {
    test.setTimeout(360_000);
    await open(page, entry.path);
    await page.getByRole('button', { name: 'Pages', exact: true }).click();

    for (const [index, count] of entry.pages.entries()) {
      const pageNumber = index + 1;
      if (pageNumber > 1) {
        await page.getByRole('button', { name: new RegExp(`^Page ${pageNumber}\\b`) }).click();
      }
      const surface = page.locator(`[data-page="${pageNumber}"]`);
      await expect(surface).toBeVisible({ timeout: 30_000 });
      await expect(surface.locator('[data-annotation-type]')).toHaveCount(count, { timeout: 30_000 });
      if (entry.apImages) {
        await expect(surface.locator('img[data-native-annotation-appearance]'))
          .toHaveCount(entry.apImages[index], { timeout: 120_000 });
      }

      // An imported native annotation must remain selectable in the app.
      const selectable = surface.locator('[data-native-annotation-hit-target], [data-annotation-type="stamp"]').first();
      if (count > 0 && await selectable.count()) {
        await selectable.click({ force: true });
        await expect(surface.locator('.cursor-se-resize')).toBeVisible();
      }
    }

    // Native Save must retain the editable annotation graph, including the
    // AP streams that Adobe and Edge use to draw this exact document.
    const savedBytes = await downloadPdf(page, 'Save');
    assertNativeRoots(await PDFDocument.load(savedBytes), entry.pages);

    // Reload the output as another browser session to expose local sidecar /
    // source-key reconciliation regressions, not just in-memory selection.
    await open(page, entry.path, savedBytes);
    await expect(page.locator('[data-page="1"] [data-annotation-type]'))
      .toHaveCount(entry.pages[0], { timeout: 120_000 });

    // Explicit Export Flattened must bake visuals and remove all /Annots.
    // It must not change the separately saved native PDF above.
    const flattened = await PDFDocument.load(await downloadPdf(page, 'Export flattened PDF'));
    expect(flattened.getPageCount()).toBe(entry.pages.length);
    for (const [index, outputPage] of flattened.getPages().entries()) {
      const remaining = outputPage.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      expect(remaining?.size() ?? 0, `Page ${index + 1} still has native annotations`).toBe(0);
      expect(outputPage.node.get(PDFName.of('Contents'))).toBeDefined();
    }
  });
}
