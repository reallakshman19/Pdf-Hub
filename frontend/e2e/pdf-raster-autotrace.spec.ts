import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test('Layer 5-6 Scanned/Raster PDF Auto-Trace Worker, Tuning Controls, and Snap Ortho Cleanup in Chromium', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  // 1. Render a clean raster PNG containing a thick L-shaped dark pipe run on white paper
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 50);
    ctx.lineTo(180, 52);
    ctx.lineTo(180, 140);
    ctx.stroke();

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  });

  const pngBytes = Buffer.from(pngBase64, 'base64');
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([240, 180]);
  const embedded = await pdfDoc.embedPng(pngBytes);
  pdfPage.drawImage(embedded, { x: 0, y: 0, width: 240, height: 180 });
  const pdfBytes = await pdfDoc.save();

  // 2. Open the raster-only PDF in DocCraft
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'scanned-pid-l5-l6.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // 3. Open Takeoff & 3D Inspector -> Port Page -> detects raster-only PDF
  await page.getByTitle('Takeoff & 3D').click();
  await expect(page.getByTestId('pdf-vector-port-panel')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('port-page-vectors-btn').click();
  await expect(page.getByTestId('vector-port-status')).toContainText(/Scanned\/raster PDF/i, {
    timeout: 10_000,
  });

  // 4. Verify Layer 6 tuning presets exist and click Auto-Trace Pipe Runs (runs real Web Worker)
  await expect(page.getByTestId('raster-method-select')).toBeVisible();
  await page.getByTestId('raster-rdp-select').selectOption('1.5');
  await page.getByTestId('raster-minlen-select').selectOption('20');
  await page.getByTestId('raster-autotrace-btn').click();

  await expect(page.getByTestId('vector-port-status')).toContainText(/Auto-traced \d+ pipe run/i, {
    timeout: 15_000,
  });
  const pipeLocator = page.locator('[data-annotation-type="perimeter-takeoff"]');
  expect(await pipeLocator.count()).toBeGreaterThan(0);

  // 5. Switch to Properties tab and apply Layer 6 Snap Ortho (90°) cleanup on the selected traced run
  await page.getByTitle('Properties').click();
  await expect(page.getByTestId('inspector-cad-pipe-section')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('clean-ortho-run-btn')).toBeVisible();
  await page.getByTestId('clean-ortho-run-btn').click();

  expect(consoleErrors).toHaveLength(0);
});
