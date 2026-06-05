import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { runWriterExportPreflight } from './writerExportPreflight';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function richElement(
  editorStateJson: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id: 'rich-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 72, y: 360, width: 420, height: 220 },
    plainText: 'Rich content',
    editorStateJson,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1,
      padding: 12,
      opacity: 1,
      fontSize: 11,
      fontFamily: 'Helvetica',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

function stateWithChildren(children: unknown[]): string {
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children,
    },
  });
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'text',
        version: 1,
        text,
        format: 0,
        style: '',
        mode: 'normal',
        detail: 0,
      },
    ],
  };
}

describe('writerExportPreflight rich content', () => {
  it('flags empty rich image source as blocking error', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 1,
      elements: [
        richElement(
          stateWithChildren([
            {
              type: 'inline-image',
              version: 1,
              src: '',
              altText: 'Missing image',
              width: 120,
              height: 80,
            },
          ]),
        ),
      ],
      assets: [],
    });

    expect(result.hasErrors).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('RICH_IMAGE_EMPTY_SOURCE');
  });

  it('warns for unsupported rich image format', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 1,
      elements: [
        richElement(
          stateWithChildren([
            {
              type: 'inline-image',
              version: 1,
              src: 'data:image/webp;base64,AA==',
              altText: 'WebP image',
              width: 120,
              height: 80,
            },
          ]),
        ),
      ],
      assets: [],
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('RICH_IMAGE_UNSUPPORTED_FORMAT');
  });

  it('warns for large rich table', async () => {
    const rows = Array.from({ length: 21 }, (_, rowIndex) => ({
      type: 'tablerow',
      version: 1,
      children: Array.from({ length: 2 }, (_, colIndex) => ({
        type: 'tablecell',
        version: 1,
        children: [paragraph(`R${rowIndex + 1}C${colIndex + 1}`)],
      })),
    }));

    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 1,
      elements: [
        richElement(
          stateWithChildren([
            {
              type: 'table',
              version: 1,
              children: rows,
            },
          ]),
        ),
      ],
      assets: [],
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('RICH_TABLE_LARGE');
  });

  it('warns when rich content may clip inside box', async () => {
    const result = await runWriterExportPreflight({
      sourceBytes: await samplePdf(),
      pageCount: 1,
      elements: [
        richElement(
          stateWithChildren(
            Array.from({ length: 20 }, (_, index) =>
              paragraph(`Paragraph ${index + 1}`),
            ),
          ),
          {
            rect: { x: 72, y: 360, width: 420, height: 90 },
          },
        ),
      ],
      assets: [],
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('RICH_CONTENT_MAY_CLIP');
  });
});
