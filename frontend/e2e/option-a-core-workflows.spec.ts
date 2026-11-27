import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

test.describe('Option A Core Workflows E2E', () => {
  test('verifies Organize More tools, Command Palette actions, Print dispatch, and Bookmark /Outlines persistence', async ({
    page,
  }) => {
    await stubNativeFilePickers(page);
    await page.addInitScript(() => {
      const target = window as unknown as {
        __printCalls: number;
        __printRenderedPages: number;
      };
      target.__printCalls = 0;
      target.__printRenderedPages = 0;
      const origAppend = Element.prototype.appendChild;
      Element.prototype.appendChild = function <T extends Node>(child: T): T {
        const res = origAppend.call(this, child);
        if (
          child instanceof HTMLIFrameElement
          && child.dataset.pdfHubPrintFrame === 'true'
          && child.contentWindow
        ) {
          child.contentWindow.print = () => {
            target.__printCalls += 1;
            target.__printRenderedPages =
              child.contentDocument?.querySelectorAll('img.pdf-hub-print-page').length ?? 0;
            child.contentWindow?.dispatchEvent(new Event('afterprint'));
          };
        }
        return res;
      };
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

    const pdfBytes = await buildTestPdf({
      bodyLines: ['Option A E2E Baseline Document'],
    });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Browse Files' }).click(),
    ]);
    await chooser.setFiles({
      name: 'option-a-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });
    await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

    // 1. Command Palette surfaces Print & hidden Organize tools
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command Palette' });
    await expect(palette).toBeVisible();
    await expect(palette.getByText('Print…')).toBeVisible();
    await expect(palette.getByText('Bates Numbering…')).toBeVisible();
    await expect(palette.getByText('Crop Margins…')).toBeVisible();
    await expect(palette.getByText('Normalize Page Size…')).toBeVisible();
    await expect(palette.getByText('Collate with PDF…')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();

    // 2. Switch to Organize mode, open More menu, and launch Bates Numbering cleanly
    await page.getByRole('tab', { name: 'Organize' }).click();
    await page.getByTestId('toolbar-organize-more-btn').click();
    const moreMenu = page.getByTestId('toolbar-organize-more-menu');
    await expect(moreMenu).toBeVisible();
    await expect(page.getByTestId('organize-menu-bates')).toBeVisible();
    await expect(page.getByTestId('organize-menu-crop')).toBeVisible();
    await expect(page.getByTestId('organize-menu-normalize')).toBeVisible();
    await expect(page.getByTestId('organize-menu-collate')).toBeVisible();

    await page.getByTestId('organize-menu-bates').click();
    await expect(page.getByText(/Bates Numbering/i)).toBeVisible();
    await page.getByRole('button', { name: /Apply Stamp to/i }).click();
    await expect(page.getByText(/Bates Numbering Complete/i)).toBeVisible({ timeout: 10_000 });

    // 3. Switch to File mode, trigger Print button, verify frame & print() call
    await page.getByRole('tab', { name: 'File' }).click();
    await page.getByTestId('toolbar-print-btn').click();
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            calls: (window as unknown as { __printCalls: number }).__printCalls,
            pages: (window as unknown as { __printRenderedPages: number }).__printRenderedPages,
          })),
        { timeout: 15_000 },
      )
      .toEqual({ calls: 1, pages: 1 });

    // 3b. While on File mode, launch Crop Margins from Command Palette and confirm auto-switch to Organize opens dialog
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await palette.getByText('Crop Margins…').click();
    await expect(page.getByText('Crop Page Margins / Trim Border Whitespace')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 4. Add a custom bookmark, switch to File mode, export flattened PDF -> verify native /Outlines persisted
    await page.getByRole('button', { name: 'Bookmarks' }).click();
    await page.getByPlaceholder('Page 1').fill('Summary Bookmark §1');
    await page.getByRole('button', { name: 'Add Bookmark' }).click();
    await expect(page.getByText('Summary Bookmark §1')).toBeVisible();

    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await page.getByRole('tab', { name: 'File' }).click();
    await page.getByRole('button', { name: 'Export flattened PDF' }).click();
    await expect.poll(() => downloads.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    const exportedPath = await downloads[0]!.path();
    expect(exportedPath).toBeTruthy();
    const exportedBytes = await readFile(exportedPath as string);
    const exportedDoc = await PDFDocument.load(exportedBytes, { updateMetadata: false });
    const outlines = exportedDoc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
    expect(outlines).toBeDefined();
    expect(outlines?.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber()).toBe(1);
  });

  test('unlocks standalone Inspector tabs (Redaction / Compliance / Takeoff) inside MobileSheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const mobileBar = page.getByTestId('mobile-bottom-bar');
    await expect(mobileBar).toBeVisible();

    await mobileBar.getByRole('tab', { name: /More/i }).click();
    await expect(page.getByText('More Actions')).toBeVisible();
    await expect(page.getByTestId('mobile-open-redaction-tab')).toBeVisible();
    await expect(page.getByTestId('mobile-open-compliance-tab')).toBeVisible();
    await expect(page.getByTestId('mobile-open-takeoff-tab')).toBeVisible();

    await page.getByTestId('mobile-open-redaction-tab').click();
    await expect(page.getByTestId('mobile-back-to-more-actions')).toBeVisible();
    await expect(page.getByRole('button', { name: /Draw Redaction Box/i })).toBeVisible();

    await page.getByTestId('mobile-back-to-more-actions').click();
    await expect(page.getByText('More Actions')).toBeVisible();
  });
});
