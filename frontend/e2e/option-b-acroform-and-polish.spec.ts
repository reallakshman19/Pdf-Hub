import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { stubNativeFilePickers } from './fixtures/stubNativeFilePickers';
import { buildTestPdf } from './fixtures/testPdf';

async function buildAcroFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText('AcroForm E2E Application', { x: 50, y: 740, size: 16 });
  const form = doc.getForm();
  const nameField = form.createTextField('applicantName');
  nameField.addToPage(page, { x: 50, y: 660, width: 220, height: 26 });
  const agreedBox = form.createCheckBox('agreed');
  agreedBox.addToPage(page, { x: 50, y: 610, width: 20, height: 20 });
  return doc.save();
}

test.describe('Option B AcroForm, CAD Gating & Built-in Customization E2E', () => {
  test('gates CAD chrome by default, customizes Workflows built-ins, and fills/saves interactive AcroForm PDFs', async ({
    page,
  }) => {
    await stubNativeFilePickers(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Browse Files' }).waitFor({ state: 'visible' });

    // 1. Open standard non-CAD PDF -> CAD chrome hidden by default, toggle pill reveals & closes it
    const plainBytes = await buildTestPdf({
      bodyLines: ['Standard General PDF Document'],
    });
    const [plainChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Browse Files' }).click(),
    ]);
    await plainChooser.setFiles({
      name: 'general.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(plainBytes),
    });
    await expect(page.locator('[data-page="1"]')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('workspace-view-tabs')).toBeHidden();
    await expect(page.getByTestId('drawing-scale-bar')).toBeHidden();
    await expect(page.getByTestId('cad-drafting-toolbar')).toBeHidden();
    await expect(page.getByTestId('cad-tools-toggle-btn')).toBeVisible();

    await page.getByTestId('cad-tools-toggle-btn').click();
    await expect(page.getByTestId('drawing-scale-bar')).toBeVisible();
    await expect(page.getByTestId('cad-drafting-toolbar')).toBeVisible();
    await expect(page.getByTestId('workspace-view-tabs')).toBeVisible();

    await page.getByTestId('cad-tools-close-btn').click();
    await expect(page.getByTestId('drawing-scale-bar')).toBeHidden();

    // 2. Automate -> Workflows -> Customize Built-ins -> Batch Text Stamp dialog opens
    await page.getByRole('tab', { name: 'Automate' }).click();
    await page.getByTestId('automate-workflows-dropdown').click();
    await page.getByTestId('automate-custom-textStamp').click();
    await expect(page.getByText('Batch Text Stamp')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 3. Open interactive AcroForm PDF, fill text + checkbox, Save, and verify persisted values
    const formBytes = await buildAcroFormPdf();
    await page.getByRole('tab', { name: 'File' }).click();
    const [formChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Open PDF' }).click(),
    ]);
    await formChooser.setFiles({
      name: 'form-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(formBytes),
    });

    await expect(page.getByTestId('acroform-status-controls')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Fillable Form · 2 fields')).toBeVisible();

    const nameInput = page.getByTestId('acroform-field-applicantName');
    const agreedCheck = page.getByTestId('acroform-field-agreed');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Ada Lovelace');
    await agreedCheck.check();
    await expect(page.getByText('Reset Form (2)')).toBeVisible();

    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => downloads.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    const savedPath = await downloads[0]!.path();
    expect(savedPath).toBeTruthy();
    const savedBytes = await readFile(savedPath as string);
    const savedDoc = await PDFDocument.load(savedBytes, { updateMetadata: false });
    const savedForm = savedDoc.getForm();
    expect(savedForm.getTextField('applicantName').getText()).toBe('Ada Lovelace');
    expect(savedForm.getCheckBox('agreed').isChecked()).toBe(true);
  });
});
