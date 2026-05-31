import { describe, expect, it } from 'vitest';
import { GENERATION_TEMPLATES, getGenerationTemplateById } from './generationRecipes';

const SUPPORTED_RAW_TEMPLATE_OPS = new Set(['add_content_page', 'add_image_header_page']);

function collectRecipeTokens(value: unknown): string[] {
  if (typeof value === 'string') {
    return Array.from(value.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)).map((match) => match[1]);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecipeTokens(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectRecipeTokens(item));
  }

  return [];
}

describe('generation recipe catalog', () => {
  it('exposes exactly 10 templates', () => {
    expect(GENERATION_TEMPLATES).toHaveLength(10);
  });

  it('every template has id, name, description, fields, and recipe', () => {
    for (const template of GENERATION_TEMPLATES) {
      expect(template.id).toEqual(expect.any(String));
      expect(template.id.length).toBeGreaterThan(0);
      expect(template.name).toEqual(expect.any(String));
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description).toEqual(expect.any(String));
      expect(template.description.length).toBeGreaterThan(0);
      expect(Array.isArray(template.fields)).toBe(true);
      expect(template.fields.length).toBeGreaterThan(0);
      expect(template.recipe).toEqual(expect.objectContaining({ id: template.id, name: template.name }));
    }
  });

  it('every template id is unique', () => {
    const ids = GENERATION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every field key is unique within its template', () => {
    for (const template of GENERATION_TEMPLATES) {
      const keys = template.fields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every template has at least one macro step', () => {
    for (const template of GENERATION_TEMPLATES) {
      expect(template.recipe.steps.length).toBeGreaterThan(0);
    }
  });

  it('every template contains at least one variable token', () => {
    for (const template of GENERATION_TEMPLATES) {
      expect(collectRecipeTokens(template.recipe).length).toBeGreaterThan(0);
    }
  });

  it('getGenerationTemplateById returns template for valid id', () => {
    expect(getGenerationTemplateById('meeting_minutes')?.name).toBe('Meeting Minutes');
    expect(getGenerationTemplateById('business_letter')?.name).toBe('Business Letter');
  });

  it('getGenerationTemplateById returns null for missing id', () => {
    expect(getGenerationTemplateById('missing_template')).toBeNull();
  });

  it('all templates are JSON-clone safe', () => {
    const cloned = JSON.parse(JSON.stringify(GENERATION_TEMPLATES)) as typeof GENERATION_TEMPLATES;
    expect(cloned).toHaveLength(GENERATION_TEMPLATES.length);
    expect(cloned.map((template) => template.id)).toEqual(
      GENERATION_TEMPLATES.map((template) => template.id),
    );
  });

  it('templates use only known Generate Document raw template ops', () => {
    for (const template of GENERATION_TEMPLATES) {
      for (const step of template.recipe.steps) {
        expect(SUPPORTED_RAW_TEMPLATE_OPS.has(step.op)).toBe(true);
      }
    }
  });
});
