import { describe, expect, it } from 'vitest';
import { getGenerationTemplateById } from './generationRecipes';
import { missingRequiredGenerationFields } from './generationFieldValidation';

describe('generation required fields', () => {
  it('requires a meaningful title for a Professional Report', () => {
    const template = getGenerationTemplateById('professional_report_full');
    if (!template) throw new Error('Required template missing');
    expect(missingRequiredGenerationFields(template, { title: '   ' })).toEqual(['Title']);
    expect(missingRequiredGenerationFields(template, { title: 'Alpha Valve' })).toEqual([]);
  });

  it('requires the invoice number without restricting optional values', () => {
    const template = getGenerationTemplateById('simple_invoice');
    if (!template) throw new Error('Required template missing');
    expect(missingRequiredGenerationFields(template, { invoiceNumber: '' }))
      .toEqual(['Invoice Number']);
    expect(missingRequiredGenerationFields(template, { invoiceNumber: 'INV-002' }))
      .toEqual([]);
  });
});
