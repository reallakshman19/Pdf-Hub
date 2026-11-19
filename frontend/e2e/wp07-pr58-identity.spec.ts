import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';

/**
 * WP07 M03 native-output challenge. Unlike the unit tests, these journeys
 * drive the deployed React entrypoint, its recipe JSON importer, preflight,
 * canonical macro runner, normal Save and an independently parsed PDF.
 */
async function persistPublicSyntheticEvidence(name: string, bytes: Uint8Array | Buffer): Promise<void> {
  const dir = process.env.WP07_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${name}`, bytes);
}

async function createThreePageSource(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const marker of ['A', 'B', 'C']) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`WP07 NATIVE SOURCE PAGE ${marker}`, {
      x: 72,
      y: 720,
      size: 16,
      font,
    });
  }
  return pdf.save();
}

async function openDocumentAndBuilder(page: Page): Promise<void> {
  await stubNativeFilePickers(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible();

  const bytes = await createThreePageSource();
  const sourceFile = Buffer.from(bytes);
  const sourceSha256 = createHash('sha256').update(sourceFile).digest('hex');
  await persistPublicSyntheticEvidence(`source-${sourceSha256}.pdf`, sourceFile);
  await test.info().attach('ALT-WP07_native-source.pdf', {
    body: sourceFile,
    contentType: 'application/pdf',
  });
  console.log(`ALT_WP07_SOURCE sha256=${sourceSha256} pages=3`);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Browse Files' }).click(),
  ]);
  await chooser.setFiles({
    name: 'wp07-three-page-source.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

  await page.locator('button:has(svg.lucide-sparkles[class*="w-[17px]"])').click();
  const sidebar = page.getByTestId('automate-sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: 'Build', exact: true }).click();
  await sidebar.getByRole('button', { name: 'Open Workflow Builder' }).click();
  const builder = page.locator('[data-macro-builder="true"]');
  await expect(builder).toBeVisible();
  await builder.getByTestId('macro-builder-advanced').locator('summary').click();
}

async function importRecipe(page: Page, steps: unknown[]): Promise<void> {
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByLabel('Macro JSON').fill(JSON.stringify({
    id: 'alt-wp07-native-parity',
    name: 'ALT WP07 native parity',
    steps,
  }));
  await builder.getByRole('button', { name: 'Import JSON' }).click();
  await expect(builder.getByText('Recipe is valid.')).toBeVisible();
}

async function saveAndInspect(page: Page): Promise<string[]> {
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(builder).toHaveCount(0);
  await page.getByRole('tab', { name: 'File' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has(svg.lucide-save.w-4)').click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  const file = await readFile(path as string);
  const outputSha256 = createHash('sha256').update(file).digest('hex');
  await persistPublicSyntheticEvidence(`export-${outputSha256}.pdf`, file);
  await test.info().attach('ALT-WP07_native-export.pdf', {
    body: file,
    contentType: 'application/pdf',
  });
  const native = await getDocument({ data: new Uint8Array(file).slice() }).promise;
  const markers: string[] = [];
  try {
    for (let index = 1; index <= native.numPages; index += 1) {
      const nativePage = await native.getPage(index);
      const content = await nativePage.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      const marker = text.match(/WP07 NATIVE SOURCE PAGE ([ABC])/);
      expect(marker, `native PDF page ${index} source identity`).not.toBeNull();
      markers.push(marker?.[1] ?? 'MISSING');
    }
  } finally {
    await native.destroy();
  }
  const witness = {
    origin: 'PDF_HUB_REAL_BROWSER_EXPORT',
    source_kind: 'PUBLIC_SYNTHETIC',
    output_sha256: outputSha256,
    page_count: markers.length,
    source_identity_order: markers,
    check: 'pdfjs-dist independent native PDF readback',
  };
  await test.info().attach('ALT-WP07_native-inspection.json', {
    body: Buffer.from(JSON.stringify(witness, null, 2)),
    contentType: 'application/json',
  });
  await persistPublicSyntheticEvidence(
    `witness-${outputSha256}.json`,
    Buffer.from(JSON.stringify(witness, null, 2)),
  );
  console.log(`ALT_WP07_EXPORT sha256=${outputSha256} pages=${markers.length} source_order=${markers.join(',')}`);
  return markers;
}

test('WP07 M03: two-step duplicate produces native page order A,A,B,C,C', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'select_pages', selector: { mode: 'list', pages: [3, 1, 3] } },
    { op: 'duplicate_pages', selector: { mode: 'selected' } },
  ]);

  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-preflight')).toContainText('3 → 5');
  await expect(builder.getByText('Test Run complete.', { exact: false })).toBeVisible();

  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible({
    timeout: 20_000,
  });

  const actual = await saveAndInspect(page);
  expect(actual).toEqual(['A', 'A', 'B', 'C', 'C']);
});

test('WP07 M03: original B survives removal and is duplicated after selection remap', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'select_pages', selector: { mode: 'list', pages: [2] } },
    { op: 'remove_pages', selector: { mode: 'list', pages: [1] } },
    { op: 'duplicate_pages', selector: { mode: 'selected' } },
  ]);
  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  await expect(builder.getByTestId('macro-builder-preflight')).toContainText('3 → 3');
  await expect(builder.getByTestId('macro-builder-run')).toBeEnabled();
  await builder.getByTestId('macro-builder-run').click();
  await expect(builder.getByText('Workflow complete.', { exact: false })).toBeVisible({ timeout: 20_000 });
  const sourceOrder = await saveAndInspect(page);
  expect(sourceOrder).toEqual(['B', 'B', 'C']);
});

test('WP07 M03: remove-all preflight blocks Run and preserves native source', async ({ page }) => {
  await openDocumentAndBuilder(page);
  await importRecipe(page, [
    { op: 'remove_pages', selector: { mode: 'all' } },
  ]);

  const builder = page.locator('[data-macro-builder="true"]');
  await builder.getByTestId('macro-builder-test-run').click();
  const preflight = builder.getByTestId('macro-builder-preflight');
  await expect(preflight).toContainText('Cannot remove all pages');
  await expect(builder.getByTestId('macro-builder-run')).toBeDisabled();
  await expect(builder.getByText('Test Run found blocking issues.')).toBeVisible();

  const actual = await saveAndInspect(page);
  expect(actual).toEqual(['A', 'B', 'C']);
});
