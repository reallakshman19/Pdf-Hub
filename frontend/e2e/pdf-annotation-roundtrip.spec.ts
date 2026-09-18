import { test, expect } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

/**
 * Journey 1 — open a real PDF, place a real annotation via the actual UI,
 * save through the editable-save pipeline, reopen the saved file, and verify
 * that the annotation persisted as a native PDF annotation object.
 *
 * No part of the PDF pipeline is mocked: the PDF is opened through the app's
 * real file-input fallback, the annotation is placed through the real UI,
 * Save runs composeEditablePdf(), and the resulting bytes are parsed with
 * pdfjs-dist to prove the PDF contains a native annotation rather than only
 * additional page-content drawing operators.
 */
test('open PDF, annotate, save, reopen, annotation persists', async ({ page }) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  const originalBytes = await buildTestPdf({
    bodyLines: ['Journey 1 fixture — annotation round-trip.'],
  });
  const originalAnnotationCount = await countPageAnnotations(originalBytes);

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

  // Save — writes native editable annotations and produces a real blob download.
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

  const savedAnnotationCount = await countPageAnnotations(savedBytes);

  // Save preserves the annotation as a native PDF annotation object.
  expect(savedAnnotationCount).toBeGreaterThan(originalAnnotationCount);
});

async function countPageAnnotations(bytes: Uint8Array): Promise<number> {
  // pdfjs-dist's `data` option takes ownership of (and detaches) the
  // underlying buffer for zero-copy loading, so callers who need to reuse
  // `bytes` afterward must pass a copy.
  const doc = await getDocument({ data: bytes.slice() }).promise;
  const pdfPage = await doc.getPage(1);
  const annotations = await pdfPage.getAnnotations({ intent: 'display' });
  return annotations.length;
}
