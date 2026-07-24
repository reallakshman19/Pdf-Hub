import type { MacroOpSchema } from './opSchema';

export interface MacroOpPresentation {
  label: string;
  description: string;
}

/**
 * Keeps legacy operation identifiers import-compatible while preventing the UI
 * from describing a visual cover as permanent redaction.
 */
export function getMacroOpPresentation(
  schema: MacroOpSchema,
): MacroOpPresentation {
  if (schema.op === 'draw_redaction_box') {
    return {
      label: 'Visual Mask (Not Secure Redaction)',
      description:
        'Draws an opaque rectangle over content. Underlying PDF data may remain searchable or extractable.',
    };
  }

  return {
    label: schema.label,
    description: schema.description,
  };
}
