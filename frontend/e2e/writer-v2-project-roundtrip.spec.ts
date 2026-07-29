import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

/**
 * Journey 2 — open a real PDF, create a Writer V2 rich text box element on
 * top of it, export the editable project ZIP, reimport it, then export
 * again and compare the two ZIPs' real element/asset counts.
 *
 * Nothing about the export/import pipeline is mocked: "Save Project" and
 * "Open Project" run the app's real exportCurrentWriterProject /
 * importPdfHubWriterProject pipeline, and both downloaded ZIPs are parsed
 * with the real JSZip library (the same one projectZip.ts itself uses) to
 * compare element and asset counts.
 */
test('Writer V2: create, export project ZIP, reimport, element/asset counts match', async ({ page }) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  const pdfBytes = await buildTestPdf({
    bodyLines: ['Journey 2 fixture — Writer V2 project round-trip.'],
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'journey2-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('tab', { name: 'Write' }).click();

  // With a PDF already open, "Writer Box" creates/opens the main rich box
  // element directly — no click-to-place interaction needed.
  await page.getByRole('button', { name: 'Writer Box', exact: true }).click();

  // First export: real Save Project → real ZIP download.
  const [firstDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save Project' }).click(),
  ]);
  const firstZipPath = await firstDownload.path();
  expect(firstZipPath).toBeTruthy();

  const fs = await import('node:fs/promises');
  const firstZipBytes = await fs.readFile(firstZipPath as string);
  const firstCounts = await readProjectCounts(firstZipBytes);

  expect(firstCounts.elementCount).toBeGreaterThanOrEqual(1);

  // Reimport the exported project through the app's real hidden file input.
  await page.getByLabel('Import editable Writer project or PDF').setInputFiles({
    name: 'journey2-project.pdfhub.zip',
    mimeType: 'application/zip',
    buffer: firstZipBytes,
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // Second export, right after reimport — no further edits — should match.
  const [secondDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save Project' }).click(),
  ]);
  const secondZipPath = await secondDownload.path();
  const secondZipBytes = await fs.readFile(secondZipPath as string);
  const secondCounts = await readProjectCounts(secondZipBytes);

  expect(secondCounts.elementCount).toBe(firstCounts.elementCount);
  expect(secondCounts.assetCount).toBe(firstCounts.assetCount);
});

async function readProjectCounts(zipBytes: Buffer): Promise<{ elementCount: number; assetCount: number }> {
  const zip = await JSZip.loadAsync(zipBytes);
  const elementsFile = zip.file('writer-elements.json');
  const assetsFile = zip.file('writer-assets.json');
  if (!elementsFile || !assetsFile) {
    throw new Error('Project ZIP is missing writer-elements.json or writer-assets.json');
  }

  const elements = JSON.parse(await elementsFile.async('string'));
  const assets = JSON.parse(await assetsFile.async('string'));

  return {
    elementCount: Array.isArray(elements) ? elements.length : 0,
    assetCount: Array.isArray(assets) ? assets.length : 0,
  };
}
