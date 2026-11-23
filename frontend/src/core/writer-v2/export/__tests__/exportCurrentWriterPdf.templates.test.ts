import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  createBlankDocumentPdfBytes,
  exportCurrentWriterPdf,
} from '../exportCurrentWriterPdf';
import { useWriterV2Store } from '../../writerV2Store';
import type { WriterDocumentMetaV2, WriterElementV2, WriterPageTemplateKind } from '../../types';
import { WRITER_PAGE_PRESETS } from '../../types';

function createBlankMeta(templateKind: WriterPageTemplateKind = 'blank'): WriterDocumentMetaV2 {
  return {
    documentFingerprint: 'doc-blank-test',
    mode: 'blankDocument',
    title: 'Template Test Document',
    pageCount: 1,
    pageSetup: {
      ...WRITER_PAGE_PRESETS.A4,
      pageTemplate: {
        kind: templateKind,
        spacing: 24,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function sampleElement(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-blank-test',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 700,
      width: 200,
      height: 50,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Notes on ruled template',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('exportCurrentWriterPdf — Vector Page Templates', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('exports plain blank document to valid PDF', async () => {
    const meta = createBlankMeta('blank');
    const bytes = await createBlankDocumentPdfBytes(meta);

    expect(bytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
  });

  it('exports ruled notebook document with vector lines', async () => {
    const blankBytes = await createBlankDocumentPdfBytes(createBlankMeta('blank'));
    const ruledBytes = await createBlankDocumentPdfBytes(createBlankMeta('ruled'));

    expect(ruledBytes.length).toBeGreaterThan(blankBytes.length);
    const pdf = await PDFDocument.load(ruledBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports engineering grid document with vector grid', async () => {
    const gridBytes = await createBlankDocumentPdfBytes(createBlankMeta('grid'));

    expect(gridBytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(gridBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports dot-grid document with vector dots', async () => {
    const dotBytes = await createBlankDocumentPdfBytes(createBlankMeta('dot-grid'));

    expect(dotBytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(dotBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports Cornell notes document with dividers and note lines', async () => {
    const cornellBytes = await createBlankDocumentPdfBytes(createBlankMeta('cornell'));

    expect(cornellBytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(cornellBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports music manuscript document with 5-line staves', async () => {
    const staffBytes = await createBlankDocumentPdfBytes(createBlankMeta('music-staff'));

    expect(staffBytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(staffBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('exports multi-page document with per-page template overrides', async () => {
    const multiMeta: WriterDocumentMetaV2 = {
      ...createBlankMeta('ruled'),
      pageCount: 3,
      pageSetup: {
        ...WRITER_PAGE_PRESETS.A4,
        pageTemplate: { kind: 'ruled', spacing: 24 },
        pageTemplates: {
          1: { kind: 'grid', spacing: 20 },
          2: { kind: 'music-staff', spacing: 7 },
        },
      },
    };

    const bytes = await createBlankDocumentPdfBytes(multiMeta);
    expect(bytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
  });

  it('integrates with exportCurrentWriterPdf for blank document with elements', async () => {
    const meta = createBlankMeta('ruled');
    useWriterV2Store.setState({
      documentMeta: meta,
      currentDocumentFingerprint: meta.documentFingerprint,
      elements: [sampleElement('elem-1')],
    });

    const bytes = await exportCurrentWriterPdf();

    expect(bytes.length).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
