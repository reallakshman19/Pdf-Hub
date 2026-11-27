import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

test('Layer 1-4 PDF Vector-to-Canvas Porting, Region Capture, Polyline Split/Edit, and 3D Volumetric Piping in Chromium', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  // 1. Construct a real vector piping PDF with an L-shaped run, branch tag, and an outside distractor
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const p1 = pdfDoc.addPage([500, 400]);

  // View space: (60,150)->(220,150)->(220,250)
  p1.drawLine({
    start: { x: 60, y: 250 },
    end: { x: 220, y: 250 },
    thickness: 2.5,
    color: rgb(0, 0.35, 0.85),
  });
  p1.drawLine({
    start: { x: 220, y: 250 },
    end: { x: 220, y: 150 },
    thickness: 2.5,
    color: rgb(0, 0.35, 0.85),
  });
  p1.drawText('4"-P-202-CS', {
    x: 105,
    y: 262,
    size: 11,
    font,
  });

  // Separate distractor line outside ROI region
  p1.drawLine({
    start: { x: 350, y: 60 },
    end: { x: 440, y: 60 },
    thickness: 1.5,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdfDoc.save();

  // 2. Open the vector PDF in DocCraft
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'piping-iso-l1-l4.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // 3. Open Takeoff & 3D Inspector and trigger ROI Region Porting around ONLY the L-pipe
  await page.getByTitle('Takeoff & 3D').click();
  await expect(page.getByTestId('pdf-vector-port-panel')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('port-region-vectors-btn').click();
  await expect(page.getByTestId('vector-roi-capture-banner')).toBeVisible();

  const roiLayer = page.getByTestId('vector-roi-capture-layer');
  const roiBox = await roiLayer.boundingBox();
  expect(roiBox).not.toBeNull();

  // Drag a marquee covering (30, 100) -> (260, 290) in viewport space
  await page.mouse.move(roiBox!.x + 30, roiBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(roiBox!.x + 260, roiBox!.y + 290, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByTestId('vector-port-status')).toContainText('Ported region: 1 polylines, 0 lines', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-annotation-type="perimeter-takeoff"]')).toHaveCount(1);

  // 4. Verify live 3D Volumetric Piping picks up the imported L-pipe & branch name
  await page.getByTestId('takeoff-open-3d-tab-btn').click();
  await expect(page.getByTestId('piping-3d-viewer')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('piping-mode-volumetric')).toBeVisible();

  // Return to 2D and test Layer 4 CAD Properties + Split Run
  await page.getByRole('button', { name: /return to 2d/i }).click();
  await expect(page.locator('[data-annotation-type="perimeter-takeoff"]')).toHaveCount(1);

  // Switch Inspector to Properties tab (annotation was auto-selected by addManyAnnotations)
  await page.getByTitle('Properties').click();
  await expect(page.getByTestId('inspector-cad-pipe-section')).toBeVisible();
  await expect(page.getByLabel('Branch / Line Tag')).toHaveValue('4"-P-202-CS');

  // Split L-pipe at Vertex #2 into 2 separate pipe legs (-A and -B)
  await page.getByTestId('split-polyline-btn').click();
  await expect(page.locator('[data-annotation-type="perimeter-takeoff"]')).toHaveCount(2);

  expect(consoleErrors).toHaveLength(0);
});
