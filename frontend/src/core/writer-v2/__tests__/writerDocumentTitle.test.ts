import { describe, expect, it } from 'vitest';
import { createBlankWriterDocumentMeta } from '../writerDocumentMode';
import {
  normalizeWriterDocumentTitle,
  updateWriterDocumentTitle,
} from '../writerDocumentTitle';

describe('writerDocumentTitle', () => {
  it('normalizes blank and whitespace titles', () => {
    expect(normalizeWriterDocumentTitle('')).toBe('Untitled document');
    expect(normalizeWriterDocumentTitle('   ')).toBe('Untitled document');
    expect(normalizeWriterDocumentTitle(undefined)).toBe('Untitled document');
  });

  it('collapses internal whitespace and limits length', () => {
    const title = normalizeWriterDocumentTitle(`  ${'A'.repeat(200)}   Draft   `);

    expect(title).toHaveLength(160);
    expect(title.startsWith('AAA')).toBe(true);
  });

  it('updates title without changing createdAt', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'title-doc',
      title: 'Old Title',
      now: '2026-01-01T00:00:00.000Z',
    });

    const next = updateWriterDocumentTitle(
      meta,
      '  New   Title  ',
      '2026-01-02T00:00:00.000Z',
    );

    expect(next.title).toBe('New Title');
    expect(next.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(next.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
