import { test, expect } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

/**
 * Journey 1 — open a real PDF, place a real annotation via the actual UI,
 * save (real flatten pipeline), reopen the saved file, and verify the
 * annotation's drawn content actually persisted into the saved bytes.
 *
 * No part of the PDF pipeline is mocked: the PDF is opened via the app's
 * real file-input fallback, the annotation is placed with a real mouse
 * click on the rendered page, "Save" runs the app's real
 * composeCommittedPdf → PdfEditAdapter.exportWithAnnotations pipeline, and
 * the resulting bytes are downloaded and parsed with pdfjs-dist (the same
 * library the app itself uses to render pages) to prove new drawn content
 * is present that wasn't in the original file.
 */
test('open PDF, annotate, save, reopen, annotation persists', async ({ page }) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  const originalBytes = await buildTestPdf({
    bodyLines: ['Journey 1 fixture — annotation round-trip.'],
  });
  const originalOperatorCount = await countPageOperators(originalBytes);

  // Initial open: the empty-state "Browse Files" CTA.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'journey1-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(originalBytes),
  });

  // Wait for the document to actually render before switching tools.
  const pageSurface = page.locator('[data-page="1"]');
  await expect(pageSurface).toBeVisible({ timeout: 15_000 });

  // The app defaults to the Annotate mode tab; place Sticky Note with a
  // single click (it's a placement-only tool, no text-selection drag needed).
  await page.getByRole('tab', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Sticky Note' }).click();
  await pageSurface.click({ position: { x: 120, y: 160 } });

  // Switch to the File mode tab to reach Save (the toolbar's real Open icon
  // is w-4 sized; the mode tab itself also uses a folder-open icon at a
  // different size, so the class selector must disambiguate).
  await page.getByRole('tab', { name: 'File' }).click();
  const openButton = page.locator('button:has(svg.lucide-folder-open.w-4)');
  const saveButton = page.locator('button:has(svg.lucide-save.w-4)');

  // Save — triggers the real flatten pipeline and a real blob download.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    saveButton.click(),
  ]);

  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();

  const fs = await import('node:fs/promises');
  const savedBytes = new Uint8Array(await fs.readFile(savedPath as string));

  // Reopen the saved file through the same real open flow.
  const [reopenChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    openButton.click(),
  ]);
  await reopenChooser.setFiles({
    name: 'journey1-fixture-saved.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(savedBytes),
  });
  await expect(pageSurface).toBeVisible({ timeout: 15_000 });

  const savedOperatorCount = await countPageOperators(savedBytes);

  // The annotation was flattened into real page-content drawing operators,
  // so the reopened, saved PDF must contain strictly more drawing
  // operations on page 1 than the pristine original.
  expect(savedOperatorCount).toBeGreaterThan(originalOperatorCount);
});

async function countPageOperators(bytes: Uint8Array): Promise<number> {
  // pdfjs-dist's `data` option takes ownership of (and detaches) the
  // underlying buffer for zero-copy loading, so callers who need to reuse
  // `bytes` afterward (e.g. to upload the same PDF) must pass a copy.
  const doc = await getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(1);
  const operatorList = await page.getOperatorList();
  return operatorList.fnArray.length;
}
