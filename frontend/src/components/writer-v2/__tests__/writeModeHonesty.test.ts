import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (file: string) =>
  readFileSync(resolve(__dirname, '..', file), 'utf8');

describe('Write mode honesty — source audit', () => {
  test('WriterOverlayLayer source contains overlay-only notice text', () => {
    const code = src('WriterOverlayLayer.tsx');
    // The honesty chip must be present in the markup
    expect(code).toMatch(/overlay.*does not edit|overlay only/i);
  });

  test('WriterOverlayLayer does not CLAIM to edit existing PDF text', () => {
    const code = src('WriterOverlayLayer.tsx');
    // Only catch positive assertions — "does not edit existing" is a valid disclaimer
    expect(code).not.toMatch(/(?:will|can)\s+edit\s+existing/i);
    expect(code).not.toMatch(/(?:will|can)\s+modif[yi]\s+the\s+PDF/i);
    expect(code).not.toMatch(/changes?\s+existing\s+text/i);
  });

  test('WriterRichElementBox does not claim to edit existing PDF text', () => {
    const code = src('WriterRichElementBox.tsx');
    expect(code).not.toMatch(/edit(s)? existing/i);
    expect(code).not.toMatch(/modif(y|ies) the PDF/i);
  });

  test('WriterInlineEditor does not claim to edit existing PDF text', () => {
    const code = src('WriterInlineEditor.tsx');
    expect(code).not.toMatch(/edit(s)? existing/i);
    expect(code).not.toMatch(/modif(y|ies) the PDF/i);
  });
});
