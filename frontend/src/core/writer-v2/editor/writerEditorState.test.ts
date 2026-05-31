import { describe, expect, it } from 'vitest';
import {
  createPlainTextEditorStateJson,
  normalizeEditorStateJson,
  plainTextFromSerializedEditorState,
} from './writerEditorState';

describe('writer-v2 editor state helpers', () => {
  it('creates serialized editor state from plain text', () => {
    const json = createPlainTextEditorStateJson('Hello writer');
    const parsed = JSON.parse(json);

    expect(parsed.root.type).toBe('root');
    expect(plainTextFromSerializedEditorState(json)).toBe('Hello writer');
  });

  it('normalizes invalid editor json to fallback plain text', () => {
    const json = normalizeEditorStateJson('{bad json', 'Fallback text');

    expect(plainTextFromSerializedEditorState(json)).toBe('Fallback text');
  });

  it('keeps valid editor json', () => {
    const source = createPlainTextEditorStateJson('Valid text');

    expect(normalizeEditorStateJson(source, 'Fallback')).toBe(source);
  });
});
