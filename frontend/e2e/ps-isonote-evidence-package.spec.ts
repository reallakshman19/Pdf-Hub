import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

const PS_ISONOTE_CSV = [
  'PS No.,Family,ISONOTE',
  'PS-11167.4,Guide,"GUIDE [Gap=10mm]"',
].join('\n');

/**
 * Journey 3 — open a real PDF containing a real PS-number reference, paste
 * a matching PS→ISONOTE table, run the real annotate pipeline (real
 * pdf.js text-layer scan against the real PDF, real macro recipe execution
 * against the real session), then export and inspect the real evidence
 * package ZIP.
 *
 * Nothing is mocked: the fixture PDF's searchable text is produced by
 * pdf-lib, the match is found by the app's real PS-number scanner reading
 * the actual PDF text layer, and the evidence package is parsed with the
 * real JSZip library to confirm it contains a real audit manifest.
 */
test('PS→ISONOTE: paste table, annotate PDF, export evidence package', async ({ page }) => {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

  const pdfBytes = await buildTestPdf({
    bodyLines: ['Support reference PS-11167.4 shown on this drawing.'],
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'journey3-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  // Switch to the Macros sidebar tab (LeftRail icon-only button; the
  // "sparkles" icon also appears, at a different size, on the Generate mode
  // tab, so the class selector must disambiguate by size).
  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  // Specialized workflows are intentionally collapsed in the integrated
  // Automate UI; interact through the real user-visible entrypoint.
  await page.getByText('Specialized workflows', { exact: true }).click();

  const recipeBuilder = page.getByTestId('ps-isonote-recipe-builder');
  await expect(recipeBuilder).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('PS No. versus ISONOTE table').fill(PS_ISONOTE_CSV);

  await recipeBuilder.getByRole('button', { name: 'Annotate PDF' }).click();

  // A real match must be found — the button's own status text reports the
  // real scan result, not a mocked one.
  await expect(recipeBuilder).toContainText(/target occurrence/i, { timeout: 20_000 });
  await expect(recipeBuilder).not.toContainText(/no mapped ps numbers were found/i);
  // Scan hits create a PREVIEW audit before annotation finishes.
  // Export only after the real reopened-PDF verification has finished;
  // otherwise Evidence ZIP correctly contains input.pdf, not annotated.pdf.
  await expect(recipeBuilder).toContainText(
    /Verified 1 of 1 PS marker\(s\) and expected ISONOTE text/i,
    { timeout: 30_000 },
  );
  await expect(recipeBuilder).toContainText(/verified · 0 warning\(s\) · 0 error\(s\)/i);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    recipeBuilder.getByRole('button', { name: 'Evidence ZIP' }).click(),
  ]);

  const zipPath = await download.path();
  expect(zipPath).toBeTruthy();

  const fs = await import('node:fs/promises');
  const zipBytes = await fs.readFile(zipPath as string);
  const zip = await JSZip.loadAsync(zipBytes);

  // Preserve exact native output + evidence archive for an external parser.
  const annotatedEntry = zip.file('annotated.pdf');
  expect(annotatedEntry).toBeTruthy();
  const annotatedBytes = await annotatedEntry!.async('uint8array');
  const { createHash } = await import('node:crypto');
  const annotatedSha256 = createHash('sha256').update(annotatedBytes).digest('hex');
  expect(annotatedSha256).toMatch(/^[a-f0-9]{64}$/);
  const evidenceDir = process.env.WP07_EVIDENCE_DIR;
  if (evidenceDir) {
    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.writeFile(`${evidenceDir}/ps-isonote-verified-${annotatedSha256}.pdf`, annotatedBytes);
    await fs.writeFile(`${evidenceDir}/ps-isonote-evidence-${annotatedSha256}.zip`, zipBytes);
  }

  // The evidence package must be a real, non-empty ZIP with at least one
  // audit/manifest entry describing the run.
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  expect(fileNames.length).toBeGreaterThan(0);

  const manifestName = fileNames.find((name) => /manifest|audit/i.test(name));
  expect(manifestName).toBeTruthy();

  const manifestText = await zip.file(manifestName as string)?.async('string');
  expect(manifestText).toBeTruthy();
  expect(manifestText).toContain('11167');
  const audit = JSON.parse(manifestText as string) as { phase?: string; verification?: { verified?: boolean } };
  expect(audit.phase).toBe('verified');
  expect(audit.verification?.verified).toBe(true);
  // Assert the visible result after capturing the native PDF, so a negative
  // control has analyzable bytes even when certification correctly fails.
  await expect(recipeBuilder).toContainText(
    /Verified 1 of 1 PS marker\(s\) and expected ISONOTE text/i,
    { timeout: 20_000 },
  );
  console.log(`WP07_PS_ISONOTE_NATIVE phase=${audit.phase} verified=${audit.verification?.verified} output_sha256=${annotatedSha256}`);
});
