import type { GenerationTemplate } from './generationTypes';

/** Validate template-required fields independently of browser form submission. */
export function missingRequiredGenerationFields(
  template: GenerationTemplate,
  values: Readonly<Record<string, string>>,
): string[] {
  return template.fields
    .filter((field) => field.required && !(values[field.key] ?? '').trim())
    .map((field) => field.label);
}
