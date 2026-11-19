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

/** Keep fallback download names tied to the entered record, not just the template. */
export function buildGeneratedDocumentOutputName(
  template: GenerationTemplate,
  values: Readonly<Record<string, string>> = {},
): string {
  const base = slugifyGeneratedDocumentName(template.name);
  const identityKeys = [
    'recordId', 'invoiceNumber', 'transmittalNumber',
    'candidateName', 'title', 'sectionTitle',
  ];
  const identity = identityKeys
    .map((key) => values[key]?.trim() ?? '')
    .find((value) => value.length > 0);
  const suffix = identity
    ? `-${slugifyGeneratedDocumentName(identity).slice(0, 48)}`
    : '';
  return `${base}${suffix}.pdf`;
}
