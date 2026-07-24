import { describe, expect, it } from 'vitest';
import { getMacroOpSchema } from './opSchema';
import { getMacroOpPresentation } from './presentation';

describe('getMacroOpPresentation', () => {
  it('renames the legacy redaction operation without changing its id', () => {
    const schema = getMacroOpSchema('draw_redaction_box');
    expect(schema).not.toBeNull();
    if (!schema) return;

    const presentation = getMacroOpPresentation(schema);
    expect(schema.op).toBe('draw_redaction_box');
    expect(presentation.label).toMatch(/visual mask/i);
    expect(presentation.description).toMatch(/searchable or extractable/i);
    expect(presentation.description).not.toMatch(/to redact content/i);
  });
});
