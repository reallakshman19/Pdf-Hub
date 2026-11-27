import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { extrudePolygonTo3D } from '../src/core/cad-3d/extrudeEngine';
import { embedU3DMeshInPdf, extractPdf3DAnnotations } from '../src/core/cad-3d/pdf3dAnnotation';

test('Native 3D PDF (/Subtype /3D U3D) scan, 3D Dock WebGL2 preview, Volumetric Piping mode, and 3D PDF round-trip export', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  // 1. Construct a real ISO 32000-1 /Subtype /3D PDF with embedded ECMA-363 U3D geometry
  const baseDoc = await PDFDocument.create();
  baseDoc.addPage([612, 792]);
  const baseBytes = await baseDoc.save();

  const skidMesh = extrudePolygonTo3D(
    [
      { x: 40, y: 40 },
      { x: 160, y: 40 },
      { x: 160, y: 120 },
      { x: 40, y: 120 },
    ],
    { depth: 30, meshId: 'E2E_PumpSkid' },
  );

  const embedded = await embedU3DMeshInPdf(baseBytes, [skidMesh], {
    annotationName: 'E2E_U3D_PumpSkid',
    viewName: 'E2E Iso Preset',
  });

  // 2. Open the native 3D PDF in DocCraft
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'native-u3d-twin.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(embedded.pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // 3. Open Takeoff & 3D Inspector tab and scan native /Subtype /3D streams
  await page.getByTitle('Takeoff & 3D').click();
  await expect(page.getByTestId('cad-3d-inspector-section')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('inspector-btn-scan-3dpdf').click();
  await expect(page.getByTestId('inspector-pdf3d-status')).toHaveText(
    'Found 1 native 3D stream(s)',
    { timeout: 10_000 },
  );

  // 4. Load extracted U3D mesh into the 3D Viewport Dock (WebGL2 in Chromium)
  await page.getByTestId('inspector-btn-load-u3d-mesh').click();
  await expect(page.getByTestId('cad-3d-viewport-dock')).toBeVisible();
  await expect(page.getByTestId('dock-u3d-badge')).toContainText('E2E_PumpSkid');

  const canvasBox = await page.getByTestId('dock-3d-canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(100);
  expect(canvasBox!.height).toBeGreaterThan(100);

  // 5. Export Native 3D PDF (U3D) and verify re-extraction from downloaded PDF bytes
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));

  await page.getByTestId('inspector-btn-export-3dpdf').click();
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

  const exportedDownload = downloads.find((d) => d.suggestedFilename().endsWith('.pdf'));
  expect(exportedDownload).toBeTruthy();
  const downloadedPath = await exportedDownload!.path();
  expect(downloadedPath).toBeTruthy();

  const exportedBytes = await readFile(downloadedPath as string);
  const reExtracted = await extractPdf3DAnnotations(new Uint8Array(exportedBytes));
  expect(reExtracted.annotationCount).toBeGreaterThanOrEqual(1);
  expect(reExtracted.annotations.some((a) => a.format === 'u3d' && a.meshes.length > 0)).toBe(true);

  // 6. Switch workspace to 3D Canvas tab cleanly
  await page.getByTestId('tab-view-3d').click();
  await expect(page.getByTestId('piping-3d-viewer')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('piping-mode-volumetric')).toBeVisible();

  expect(consoleErrors).toHaveLength(0);
});
