import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { applyAcroFormUpdatesToPdf, extractPdfFormFields } from './acroFormEngine';

async function buildSampleFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();

  const nameField = form.createTextField('applicant.name');
  nameField.setText('Ada');
  nameField.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });

  const notesField = form.createTextField('applicant.notes');
  notesField.enableMultiline();
  notesField.addToPage(page, { x: 50, y: 620, width: 250, height: 60 });

  const agreeBox = form.createCheckBox('applicant.agree');
  agreeBox.addToPage(page, { x: 50, y: 580, width: 18, height: 18 });

  const roleDropdown = form.createDropdown('applicant.role');
  roleDropdown.addOptions(['Engineer', 'Reviewer', 'Manager']);
  roleDropdown.select('Engineer');
  roleDropdown.addToPage(page, { x: 50, y: 530, width: 160, height: 24 });

  const tierRadio = form.createRadioGroup('applicant.tier');
  tierRadio.addOptionToPage('Standard', page, { x: 50, y: 480, width: 16, height: 16 });
  tierRadio.addOptionToPage('Priority', page, { x: 120, y: 480, width: 16, height: 16 });
  tierRadio.select('Standard');

  return doc.save();
}

describe('acroFormEngine', () => {
  it('returns empty result for PDFs without an AcroForm dictionary', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 500]);
    const result = await extractPdfFormFields(await doc.save());
    expect(result).toEqual({ hasForm: false, fields: [] });
  });

  it('extracts text, multiline, checkbox, dropdown, and radio fields in top-left view coordinates', async () => {
    const bytes = await buildSampleFormPdf();
    const extracted = await extractPdfFormFields(bytes);

    expect(extracted.hasForm).toBe(true);
    expect(extracted.fields).toHaveLength(5);

    const name = extracted.fields.find((f) => f.name === 'applicant.name');
    expect(name).toMatchObject({
      kind: 'text',
      value: 'Ada',
      multiline: false,
      readOnly: false,
    });
    expect(name?.widgets[0]?.pageNumber).toBe(1);
    expect(name?.widgets[0]?.rect).toEqual({ x: 49.5, y: 75.5, width: 201, height: 25 });

    const notes = extracted.fields.find((f) => f.name === 'applicant.notes');
    expect(notes).toMatchObject({ kind: 'text', multiline: true });

    const agree = extracted.fields.find((f) => f.name === 'applicant.agree');
    expect(agree).toMatchObject({ kind: 'checkbox', value: false });

    const role = extracted.fields.find((f) => f.name === 'applicant.role');
    expect(role).toMatchObject({
      kind: 'dropdown',
      value: 'Engineer',
      options: ['Engineer', 'Reviewer', 'Manager'],
    });

    const tier = extracted.fields.find((f) => f.name === 'applicant.tier');
    expect(tier).toMatchObject({
      kind: 'radio',
      value: 'Standard',
      options: ['Standard', 'Priority'],
    });
    expect(tier?.widgets).toHaveLength(2);
    expect(tier?.widgets.map((w) => w.onValue)).toEqual(['Standard', 'Priority']);
  });

  it('applies editable updates cleanly and supports flattening on export', async () => {
    const bytes = await buildSampleFormPdf();
    const updated = await applyAcroFormUpdatesToPdf(
      bytes,
      {
        'applicant.name': 'Grace Hopper',
        'applicant.agree': true,
        'applicant.role': 'Manager',
        'applicant.tier': 'Priority',
      },
      { flatten: false },
    );

    const roundTrip = await extractPdfFormFields(updated);
    expect(roundTrip.fields.find((f) => f.name === 'applicant.name')?.value).toBe('Grace Hopper');
    expect(roundTrip.fields.find((f) => f.name === 'applicant.agree')?.value).toBe(true);
    expect(roundTrip.fields.find((f) => f.name === 'applicant.role')?.value).toBe('Manager');
    expect(roundTrip.fields.find((f) => f.name === 'applicant.tier')?.value).toBe('Priority');

    const flattened = await applyAcroFormUpdatesToPdf(
      updated,
      {},
      { flatten: true },
    );
    const flattenedDoc = await PDFDocument.load(flattened);
    expect(flattenedDoc.getForm().getFields()).toHaveLength(0);
  });
});
