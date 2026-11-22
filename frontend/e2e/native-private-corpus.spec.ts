import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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

async function open(page: Page, path: string) {
  await stubNativeFilePickers(page);
  await page.goto('./');
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await picker.setFiles({
    name: basename(path),
    mimeType: 'application/pdf',
    buffer: readFileSync(path),
  });
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 60_000 });
}

for (const entry of corpus) {
  test(`private native source: ${basename(entry.path)}`, async ({ page }) => {
    test.setTimeout(180_000);
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
          .toHaveCount(entry.apImages[index], { timeout: 30_000 });
      }

      // An imported native annotation must remain selectable in the app.
      const selectable = surface.locator('[data-native-annotation-hit-target], [data-annotation-type="stamp"]').first();
      if (count > 0 && await selectable.count()) {
        await selectable.click({ force: true });
        await expect(surface.locator('.cursor-se-resize')).toBeVisible();
      }
    }
  });
}
