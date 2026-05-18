import { describe, expect, it } from 'vitest';
import { buildGenerationRecipe } from './buildGenerationRecipe';
import { getGenerationTemplateById } from './generationRecipes';

describe('buildGenerationRecipe', () => {
  it('prepends apply_template_vars', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {},
      fileName: 'source.pdf',
      pageCount: 3,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(recipe.steps[0]).toMatchObject({
      op: 'apply_template_vars',
    });
  });

  it('includes default vars: filename, file_name, page_count, date, year', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {},
      fileName: 'source.pdf',
      pageCount: 7,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    const firstStep = recipe.steps[0];
    expect(firstStep.op).toBe('apply_template_vars');

    if (firstStep.op !== 'apply_template_vars') {
      throw new Error('Expected first step to be apply_template_vars');
    }

    expect(firstStep.vars.filename).toBe('source.pdf');
    expect(firstStep.vars.file_name).toBe('source.pdf');
    expect(firstStep.vars.page_count).toBe('7');
    expect(firstStep.vars.date).toBeTruthy();
    expect(firstStep.vars.year).toBe('2026');
  });

  it('includes user values: title, author, department, status', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {
        title: 'Pipe Rack Report',
        author: 'Lakshman',
        department: 'Engineering',
        status: 'IFR',
      },
      fileName: 'source.pdf',
      pageCount: 3,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    const firstStep = recipe.steps[0];
    expect(firstStep.op).toBe('apply_template_vars');

    if (firstStep.op !== 'apply_template_vars') {
      throw new Error('Expected first step to be apply_template_vars');
    }

    expect(firstStep.vars.title).toBe('Pipe Rack Report');
    expect(firstStep.vars.author).toBe('Lakshman');
    expect(firstStep.vars.department).toBe('Engineering');
    expect(firstStep.vars.status).toBe('IFR');
  });

  it('does not mutate template recipe', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();

    const before = JSON.stringify(template!.recipe);

    buildGenerationRecipe({
      template: template!,
      values: {
        title: 'Mutability Test',
      },
      fileName: 'source.pdf',
      pageCount: 3,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(JSON.stringify(template!.recipe)).toBe(before);
  });

  it('branded cover keeps fallback image when no brandImageDataUrl is provided', () => {
    const template = getGenerationTemplateById('branded_cover_page');
    expect(template).not.toBeNull();

    const originalStep = template!.recipe.steps.find((step) => step.op === 'add_image_header_page');
    expect(originalStep?.op).toBe('add_image_header_page');

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {},
      fileName: 'source.pdf',
      pageCount: 1,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    const generatedStep = recipe.steps.find((step) => step.op === 'add_image_header_page');
    expect(generatedStep?.op).toBe('add_image_header_page');

    if (originalStep?.op !== 'add_image_header_page' || generatedStep?.op !== 'add_image_header_page') {
      throw new Error('Expected branded cover image steps');
    }

    expect(generatedStep.imageSrc).toBe(originalStep.imageSrc);
  });

  it('branded cover uses provided brandImageDataUrl when supplied', () => {
    const template = getGenerationTemplateById('branded_cover_page');
    expect(template).not.toBeNull();

    const imageDataUrl = 'data:image/png;base64,TEST_IMAGE';

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {},
      fileName: 'source.pdf',
      pageCount: 1,
      now: new Date('2026-01-02T03:04:05.000Z'),
      brandImageDataUrl: imageDataUrl,
    });

    const generatedStep = recipe.steps.find((step) => step.op === 'add_image_header_page');
    expect(generatedStep?.op).toBe('add_image_header_page');

    if (generatedStep?.op !== 'add_image_header_page') {
      throw new Error('Expected branded cover image step');
    }

    expect(generatedStep.imageSrc).toBe(imageDataUrl);
  });

  it('raw title and filename tokens remain in recipe body before executor expansion, but vars are injected', () => {
    const template = getGenerationTemplateById('professional_report_full');
    expect(template).not.toBeNull();

    const recipe = buildGenerationRecipe({
      template: template!,
      values: {
        title: 'Token Test',
      },
      fileName: 'token-source.pdf',
      pageCount: 2,
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(JSON.stringify(recipe.steps)).toContain('{{title}}');

    const firstStep = recipe.steps[0];
    expect(firstStep.op).toBe('apply_template_vars');

    if (firstStep.op !== 'apply_template_vars') {
      throw new Error('Expected first step to be apply_template_vars');
    }

    expect(firstStep.vars.title).toBe('Token Test');
    expect(firstStep.vars.filename).toBe('token-source.pdf');
  });
});
