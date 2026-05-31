import { describe, expect, it } from 'vitest';
import { GENERATION_TEMPLATES } from './generationRecipes';
import {
  extractTemplateTokens,
  validateGenerationTemplateLibrary,
  validateGenerationTemplates,
} from './templateLibraryValidation';

describe('templateLibraryValidation', () => {
  it('current generation template library has zero validation errors', () => {
    const issues = validateGenerationTemplateLibrary();
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('current generation template library has at least ten templates', () => {
    expect(GENERATION_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('extracts template tokens recursively from recipe structures', () => {
    const tokens = extractTemplateTokens({
      title: '{{title}}',
      nested: [{ text: 'Prepared by {{preparedBy}} on {{date}}' }],
    });

    expect(Array.from(tokens).sort()).toEqual(['date', 'preparedBy', 'title']);
  });

  it('detects duplicate template ids', () => {
    const [first] = GENERATION_TEMPLATES;
    const issues = validateGenerationTemplates([first, first]);

    expect(issues.some((issue) =>
      issue.severity === 'error' &&
      issue.message.includes('Duplicate template id'),
    )).toBe(true);
  });

  it('detects duplicate field keys', () => {
    const template = structuredClone(GENERATION_TEMPLATES[0]);
    template.fields = [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'title', label: 'Title Again', type: 'text' },
    ];

    const issues = validateGenerationTemplates([template]);

    expect(issues.some((issue) =>
      issue.severity === 'error' &&
      issue.message.includes('Duplicate field key'),
    )).toBe(true);
  });

  it('detects unsupported raw template ops', () => {
    const template = structuredClone(GENERATION_TEMPLATES[0]);
    template.recipe.steps = [
      {
        op: 'rotate_pages',
        selector: { mode: 'all' },
        degrees: 90,
      } as never,
    ];

    const issues = validateGenerationTemplates([template]);

    expect(issues.some((issue) =>
      issue.severity === 'error' &&
      issue.message.includes('Unsupported raw template op'),
    )).toBe(true);
  });

  it('reports unused fields as warnings', () => {
    const template = structuredClone(GENERATION_TEMPLATES[0]);
    template.fields = [
      ...template.fields,
      { key: 'unusedField', label: 'Unused Field', type: 'text' },
    ];

    const issues = validateGenerationTemplates([template]);

    expect(issues.some((issue) =>
      issue.severity === 'warning' &&
      issue.message.includes('unusedField'),
    )).toBe(true);
  });
});
