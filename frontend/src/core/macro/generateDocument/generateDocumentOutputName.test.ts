import { describe, expect, it } from 'vitest';
import {
  buildGeneratedDocumentOutputName,
  slugifyGeneratedDocumentName,
} from './generateDocumentOutputName';
import { getGenerationTemplateById } from './generationRecipes';

describe('generateDocumentOutputName', () => {
  it('slugifies normal template names', () => {
    expect(slugifyGeneratedDocumentName('Professional Report')).toBe('professional-report');
  });

  it('removes unsafe punctuation', () => {
    expect(slugifyGeneratedDocumentName('NDA / Cover: Sheet!')).toBe('nda-cover-sheet');
  });

  it('falls back for empty names', () => {
    expect(slugifyGeneratedDocumentName('   ')).toBe('generated-document');
  });

  it('builds pdf filename from template name', () => {
    const template = getGenerationTemplateById('meeting_minutes');

    expect(template).not.toBeNull();
    expect(buildGeneratedDocumentOutputName(template!)).toBe('meeting-minutes.pdf');
  });
  it('distinguishes two records that share the Professional Report template', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();
    expect(buildGeneratedDocumentOutputName(template!, { title: 'Alpha Valve' }))
      .toBe('professional-report-alpha-valve.pdf');
    expect(buildGeneratedDocumentOutputName(template!, { title: 'Beta Pump' }))
      .toBe('professional-report-beta-pump.pdf');
  });

  it('uses explicit document identifiers before incidental titles', () => {
    const template = getGenerationTemplateById('simple_invoice');
    expect(template).not.toBeNull();
    expect(buildGeneratedDocumentOutputName(template!, {
      invoiceNumber: 'INV-001', title: 'Same title',
    })).toBe('simple-invoice-inv-001.pdf');
  });
});
