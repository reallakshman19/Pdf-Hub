import type { GenerationTemplate } from './generationTypes';

export function slugifyGeneratedDocumentName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'generated-document';
}

export function buildGeneratedDocumentOutputName(template: GenerationTemplate): string {
  return `${slugifyGeneratedDocumentName(template.name)}.pdf`;
}
