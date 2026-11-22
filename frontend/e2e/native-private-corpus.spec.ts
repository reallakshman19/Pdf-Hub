import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

interface CorpusEntry {
  path: string;
  /** Number of imported, interactive annotation roots on each page. */
  pages: number[];
  /** Optional number of source-AP images expected on each page. */
  apImages?: number[];
  /** SHA-256 of the exact customer source bytes: wrong inputs fail first. */
  sha256?: string;
  subtypes?: Record<string, number>[];
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
    if (row.sha256 !== undefined && (
      typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(row.sha256)
    )) throw new Error('sha256 must be a 64-character hex digest');
    if (row.subtypes !== undefined && (
      !Array.isArray(row.subtypes) || row.subtypes.length !== row.pages.length
    )) throw new Error('subtypes must have one entry per page');
    return {
      path: row.path, pages: row.pages, apImages: row.apImages,
      sha256: row.sha256, subtypes: row.subtypes,
    } as CorpusEntry;
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

/** Do not compare /Annots lengths alone: equal counts can hide lost and replaced objects.
 * Each expected original is identified by its page and /NM and its raw normal
 * appearance bytes must survive native Save without alteration.
 */
function nativeObjectEvidence(pdf: PDFDocument) {
  return pdf.getPages().map((page, pageIndex) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    const objects = new Map<string, { subtype: string; apHash: string; sourceRef: string }>();
    if (!annots) return objects;
    for (let i = 0; i < annots.size(); i++) {
      const sourceRef = annots.get(i)?.toString() ?? `direct:${i}`;
      const dict = annots.lookup(i, PDFDict);
      const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText();
      if (!subtype || subtype === 'Popup' || dict.get(PDFName.of('IRT'))) continue;
      const name = dict.lookupMaybe(PDFName.of('NM'), PDFString, PDFHexString)?.decodeText();
      if (!name) throw new Error(`Source page ${pageIndex + 1} contains native ${subtype} without /NM`);
      const normal = dict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'));
      const stream = normal ? pdf.context.lookup(normal) : null;
      if (!(stream instanceof PDFStream)) {
        throw new Error(`Source page ${pageIndex + 1} /NM ${name} has no directly renderable /AP/N stream`);
      }
      if (objects.has(name)) {
        throw new Error(`Ambiguous duplicate native /NM ${name} on page ${pageIndex + 1}`);
      }
      objects.set(name, {
        subtype,
        sourceRef,
        apHash: createHash('sha256').update(stream.getContents()).digest('hex'),
      });
    }
    return objects;
  });
}

function verifySavedObjects(
  original: ReturnType<typeof nativeObjectEvidence>,
  saved: ReturnType<typeof nativeObjectEvidence>,
) {
  expect(saved.length).toBe(original.length);
  for (let i = 0; i < original.length; i++) {
    expect([...saved[i].keys()].sort(), `Page ${i + 1} native /NM identities`)
      .toEqual([...original[i].keys()].sort());
    for (const [name, source] of original[i]) {
      const output = saved[i].get(name);
      expect(output?.subtype, `Page ${i + 1} /NM ${name} subtype`).toBe(source.subtype);
      expect(output?.apHash, `Page ${i + 1} /NM ${name} source /AP byte fidelity`)
        .toBe(source.apHash);
    }
  }
}

function writePrivateOutput(entry: CorpusEntry, kind: 'native-saved' | 'flattened', bytes: Uint8Array) {
  const directory = process.env.PDFHUB_NATIVE_CORPUS_OUTPUT_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${basename(entry.path, '.pdf')}.${kind}.pdf`), bytes);
}

async function assertSourceDomAndSelection(
  page: Page,
  pageNumber: number,
  sourceObjects: Map<string, { subtype: string; apHash: string; sourceRef: string }>,
  verifySelection: boolean,
) {
  const surface = page.locator(`[data-page="${pageNumber}"]`);
  await expect(surface).toBeVisible({ timeout: 30_000 });
  const roots = surface.locator('[data-native-source-ref]');
  await expect(roots).toHaveCount(sourceObjects.size, { timeout: 120_000 });
  const actual = await roots.evaluateAll((elements) => elements.map((element) =>
    element.getAttribute('data-native-source-ref')));
  const expectedRefs = [...sourceObjects.values()].map((item) => item.sourceRef);
  expect(actual.sort(), `Page ${pageNumber} React annotation DOM source identities`)
    .toEqual(expectedRefs.sort());
  if (!verifySelection) return;

  for (const item of sourceObjects.values()) {
    const node = surface.locator('[data-native-source-ref]').filter({
      has: page.locator('[data-native-annotation-hit-target]'),
    });
    // Prefer the true pointer hit surface; normal stamps/notes/lines own
    // pointer events directly. Do not force-click through other annotations.
    const candidate = surface.locator(`[data-native-source-ref="${item.sourceRef}"]`);
    await expect(candidate, `Missing individual native source ${item.sourceRef}`).toHaveCount(1);
    const hitTarget = candidate.locator('[data-native-annotation-hit-target]');
    const clickable = await hitTarget.count() ? hitTarget.first() : candidate;
    await clickable.click({ timeout: 10_000 });
    await expect(candidate, `Native ${item.sourceRef} is not pointer-selectable`)
      .toHaveAttribute('data-native-selected', 'true');
    void node; // Selector kept locally for debugging hit-surface differences.
  }
}

for (const entry of corpus) {
  test(`private native source: ${basename(entry.path)}`, async ({ page }) => {
    test.setTimeout(360_000);
    const inputBytes = readFileSync(entry.path);
    if (entry.sha256) {
      expect(createHash('sha256').update(inputBytes).digest('hex'),
        'Wrong or modified input source PDF').toBe(entry.sha256);
    }
    const sourcePdf = await PDFDocument.load(inputBytes);
    assertNativeRoots(sourcePdf, entry.pages);
    const sourceObjects = nativeObjectEvidence(sourcePdf);
    if (entry.subtypes) {
      for (const [index, expected] of entry.subtypes.entries()) {
        const roots = sourcePdf.getPage(index).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
        const actual: Record<string, number> = {};
        if (roots) for (let i = 0; i < roots.size(); i++) {
          const dict = roots.lookup(i, PDFDict);
          const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText();
          if (!subtype || subtype === 'Popup' || dict.get(PDFName.of('IRT'))) continue;
          actual[subtype] = (actual[subtype] ?? 0) + 1;
        }
        expect(actual, `Page ${index + 1} source subtype distribution`).toEqual(expected);
      }
    }

    await open(page, entry.path, inputBytes);
    await page.getByRole('button', { name: 'Pages', exact: true }).click();

    for (const [index, count] of entry.pages.entries()) {
      const pageNumber = index + 1;
      if (pageNumber > 1) {
        await page.getByRole('button', { name: new RegExp(`^Page ${pageNumber}\\b`) }).click();
      }
      const surface = page.locator(`[data-page="${pageNumber}"]`);
      await expect(surface.locator('[data-annotation-type]')).toHaveCount(count, { timeout: 30_000 });
      await assertSourceDomAndSelection(page, pageNumber, sourceObjects[index], true);
      if (entry.apImages) {
        await expect(surface.locator('img[data-native-annotation-appearance]'))
          .toHaveCount(entry.apImages[index], { timeout: 120_000 });
      }
    }

    // Native Save must retain the editable annotation graph, including the
    // AP streams that Adobe and Edge use to draw this exact document.
    const savedBytes = await downloadPdf(page, 'Save');
    const savedPdf = await PDFDocument.load(savedBytes);
    assertNativeRoots(savedPdf, entry.pages);
    verifySavedObjects(sourceObjects, nativeObjectEvidence(savedPdf));
    writePrivateOutput(entry, 'native-saved', savedBytes);

    // Reload the output as another browser session to expose local sidecar /
    // source-key reconciliation regressions, not just in-memory selection.
    await open(page, entry.path, savedBytes);
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    for (const [index, count] of entry.pages.entries()) {
      const pageNumber = index + 1;
      if (pageNumber > 1) {
        await page.getByRole('button', { name: new RegExp(`^Page ${pageNumber}\\b`) }).click();
      }
      await expect(page.locator(`[data-page="${pageNumber}"] [data-annotation-type]`))
        .toHaveCount(count, { timeout: 120_000 });
      await assertSourceDomAndSelection(page, pageNumber, sourceObjects[index], false);
    }

    // Explicit Export Flattened must bake visuals and remove all /Annots.
    // It must not change the separately saved native PDF above.
    const flattenedBytes = await downloadPdf(page, 'Export flattened PDF');
    writePrivateOutput(entry, 'flattened', flattenedBytes);
    const flattened = await PDFDocument.load(flattenedBytes);
    expect(flattened.getPageCount()).toBe(entry.pages.length);
    for (const [index, outputPage] of flattened.getPages().entries()) {
      const remaining = outputPage.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      expect(remaining?.size() ?? 0, `Page ${index + 1} still has native annotations`).toBe(0);
      expect(outputPage.node.get(PDFName.of('Contents'))).toBeDefined();
    }
  });
}
