import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

test('PDF/A archival export workflow runs ExportWorker, embeds OutputIntent/XMP/ID, and emits JSON certificate', async ({
  page,
}) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  const pdfBytes = await buildTestPdf({
    bodyLines: ['ISO 19005 Archival Export Browser Verification'],
  });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'archival-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // Switch to Inspector PDF/A & Compliance tab without any annotation selection
  await page.getByTitle('PDF/A & Compliance').click();
  await expect(page.getByTestId('compliance-inspector-tab')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('compliance-open-export-btn')).toBeVisible();

  // Open the Archival Export modal from Inspector button
  await page.getByTestId('compliance-open-export-btn').click();
  await expect(page.getByTestId('pdfa-export-dialog')).toBeVisible();
  await expect(page.getByTestId('pdfa-export-submit')).toBeEnabled({ timeout: 10_000 });

  const downloads: Download[] = [];
  page.on('download', (d) => {
    downloads.push(d);
  });

  await page.getByTestId('pdfa-export-submit').click();

  await expect.poll(() => downloads.length, { timeout: 25_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('pdfa-export-dialog')).toBeHidden({ timeout: 15_000 });

  const pdfDownload = downloads.find((d) => d.suggestedFilename().endsWith('.pdf'));
  const jsonDownload = downloads.find((d) => d.suggestedFilename().endsWith('.json'));
  expect(pdfDownload).toBeTruthy();
  expect(jsonDownload).toBeTruthy();
  expect(pdfDownload!.suggestedFilename()).toBe('archival-e2e-pdfa-2b.pdf');
  expect(jsonDownload!.suggestedFilename()).toBe('archival-e2e-pdfa-2b-report.json');

  const pdfPath = await pdfDownload!.path();
  const jsonPath = await jsonDownload!.path();
  expect(pdfPath).toBeTruthy();
  expect(jsonPath).toBeTruthy();

  const exportedPdfBytes = await readFile(pdfPath as string);
  const exportedJson = JSON.parse(await readFile(jsonPath as string, 'utf8')) as {
    passed: boolean;
    targetConformance: string;
    remainingBlockers: unknown[];
    remainingWarnings: unknown[];
  };

  expect(exportedJson.passed).toBe(true);
  expect(exportedJson.targetConformance).toBe('PDFA_2B');
  expect(exportedJson.remainingBlockers).toHaveLength(0);
  expect(exportedJson.remainingWarnings).toHaveLength(0);

  const exportedDoc = await PDFDocument.load(exportedPdfBytes, { updateMetadata: false });
  expect(exportedDoc.context.trailerInfo.ID).toBeInstanceOf(PDFArray);
  const intents = exportedDoc.catalog.lookup(PDFName.of('OutputIntents'), PDFArray);
  expect(intents.size()).toBeGreaterThanOrEqual(1);
  expect(intents.lookup(0, PDFDict).lookup(PDFName.of('S'), PDFName).decodeText()).toBe('GTS_PDFA1');
  const metadataStream = exportedDoc.catalog.lookup(PDFName.of('Metadata')) as PDFStream;
  const xmp = new TextDecoder('utf-8').decode(metadataStream.getContents());
  expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
  expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
});
