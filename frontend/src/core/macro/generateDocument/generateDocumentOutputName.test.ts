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
});
