import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import {
  getWriterQuickTemplate,
  getWriterQuickTemplatesByGroup,
  insertWriterQuickTemplate,
  WRITER_QUICK_TEMPLATES,
} from './writerQuickTemplates';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

describe('writerQuickTemplates', () => {
  beforeEach(async () => {
    useWriterV2Store.getState().clearWriterV2();

    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('has unique template ids', () => {
    const ids = WRITER_QUICK_TEMPLATES.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groups stamp templates', () => {
    const stamps = getWriterQuickTemplatesByGroup('stamp');

    expect(stamps.length).toBeGreaterThan(0);
    expect(stamps.every((template) => template.group === 'stamp')).toBe(true);
  });

  it('retrieves a known template', () => {
    expect(getWriterQuickTemplate('stampReviewed').label).toBe('REVIEWED');
  });

  it('inserts a reviewed stamp on current page', async () => {
    const result = await insertWriterQuickTemplate('stampReviewed');
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('textStamp');
    expect(state.elements[0].plainText).toBe('REVIEWED');
    expect(state.elements[0].pageIndex).toBe(0);
  });

  it('inserts a review label with metadata', async () => {
    const result = await insertWriterQuickTemplate('reviewEngineering');
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements[0].type).toBe('reviewLabel');
    expect(state.elements[0].review?.status).toBe('open');
    expect(state.elements[0].review?.priority).toBe('medium');
    expect(state.elements[0].review?.category).toBe('engineering');
  });

  it('rejects insert when no PDF is open', async () => {
    useSessionStore.getState().clearDocument();

    const result = await insertWriterQuickTemplate('stampReviewed');

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/open a pdf/i);
  });
});
