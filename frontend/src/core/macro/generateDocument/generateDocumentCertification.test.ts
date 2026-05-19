import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { executeMacroRecipe } from '@/core/macro/executor';
import type { MacroExecutionContext } from '@/core/macro/types';
import { buildGenerationRecipe } from './buildGenerationRecipe';
import { GENERATION_TEMPLATES } from './generationRecipes';

async function createSourcePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return await pdf.save();
}

function valuesForTemplate(
  template: (typeof GENERATION_TEMPLATES)[number],
): Record<string, string> {
  return Object.fromEntries(
    template.fields.map((field) => {
      if (field.type === 'date') {
        return [field.key, '2026-05-18'];
      }

      if (field.type === 'select') {
        return [field.key, field.options?.[0]?.value ?? field.defaultValue ?? ''];
      }

      return [
        field.key,
        field.defaultValue && !field.defaultValue.includes('{{')
          ? field.defaultValue
          : `value_for_${field.key}`,
      ];
    }),
  );
}

async function expectValidPdf(bytes: Uint8Array): Promise<PDFDocument> {
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.length).toBeGreaterThan(100);

  return await PDFDocument.load(bytes);
}

describe('Generate Document certification', () => {
  it.each(GENERATION_TEMPLATES.map((template) => [template.id, template] as const))(
    'executes template %s through the macro engine',
    async (_templateId, template) => {
      const sourcePdf = await createSourcePdf();
      const recipe = buildGenerationRecipe({
        template,
        values: valuesForTemplate(template),
        fileName: 'source.pdf',
        pageCount: 1,
        now: new Date('2026-05-18T00:00:00.000Z'),
      });

      const ctx: MacroExecutionContext = {
        workingBytes: sourcePdf,
        pageCount: 1,
        selectedPages: [],
        currentPage: 1,
        fileName: 'source.pdf',
        donorFiles: {},
        now: new Date('2026-05-18T00:00:00.000Z'),
      };

      const result = await executeMacroRecipe(recipe, ctx);

      expect(result.success).toBe(true);
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.finalBytes.length).toBeGreaterThan(sourcePdf.length);

      const finalPdf = await expectValidPdf(result.finalBytes);
      expect(finalPdf.getPageCount()).toBeGreaterThanOrEqual(2);
    },
  );
});
