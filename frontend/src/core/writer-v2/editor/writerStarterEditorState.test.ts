import { describe, expect, it } from 'vitest';
import {
  createWriterStarterEditorStateJson,
  plainTextFromSerializedEditorState,
} from './writerEditorState';

describe('writer starter editor states', () => {
  it('creates valid blank starter state', () => {
    const json = createWriterStarterEditorStateJson('blank');
    const parsed = JSON.parse(json);

    expect(parsed.root.type).toBe('root');
    expect(parsed.root.children[0].type).toBe('paragraph');
  });

  it('creates authoring card state with heading and body text', () => {
    const json = createWriterStarterEditorStateJson('authoringCard');
    const parsed = JSON.parse(json);

    expect(parsed.root.type).toBe('root');
    expect(parsed.root.children[0].type).toBe('heading');
    expect(parsed.root.children[0].tag).toBe('h1');
    expect(plainTextFromSerializedEditorState(json)).toContain('Document Heading');
    expect(plainTextFromSerializedEditorState(json)).toContain('Action / comment');
  });

  it('creates review comment state', () => {
    const json = createWriterStarterEditorStateJson('reviewComment');
    const text = plainTextFromSerializedEditorState(json);

    expect(text).toContain('Review Comment');
    expect(text).toContain('Required action');
  });

  it('creates engineering note state', () => {
    const json = createWriterStarterEditorStateJson('engineeringNote');
    const text = plainTextFromSerializedEditorState(json);

    expect(text).toContain('Engineering Note');
    expect(text).toContain('Recommendation');
  });
});
