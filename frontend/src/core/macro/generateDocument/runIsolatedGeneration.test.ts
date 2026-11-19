import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildGenerationRecipe } from './buildGenerationRecipe';
import { getGenerationTemplateById } from './generationRecipes';
import { runGenerationRecipeOnSnapshot } from './runIsolatedGeneration';

describe('isolated document generation', () => {
  it('two records create two 2-page PDFs while the source stays 1 page', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const sourceBytes = await pdf.save();
    const template = getGenerationTemplateById('professional_report_full');
    if (!template) throw new Error('Missing report template');
    const now = new Date('2026-11-19T00:00:00.000Z');
    const snapshot = {
      workingBytes: sourceBytes, pageCount: 1, selectedPages: [],
      currentPage: 1, fileName: 'source.pdf', now,
    };
    const generate = (title: string) => runGenerationRecipeOnSnapshot(
      buildGenerationRecipe({
        template, values: { title, author: 'Independent' },
        fileName: snapshot.fileName, pageCount: 1, now,
      }),
      snapshot,
    );
    const alpha = await generate('Alpha Valve');
    const beta = await generate('Beta Pump');
    expect(alpha.success).toBe(true);
    expect(beta.success).toBe(true);
    expect((await PDFDocument.load(alpha.finalBytes)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(beta.finalBytes)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(sourceBytes)).getPageCount()).toBe(1);
    expect(sourceBytes).toEqual(await pdf.save());
    expect(alpha.finalBytes).not.toEqual(beta.finalBytes);
  });
});
