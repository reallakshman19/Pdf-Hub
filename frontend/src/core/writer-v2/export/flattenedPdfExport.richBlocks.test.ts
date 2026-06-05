import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function richElement(editorStateJson: string): WriterElementV2 {
  return {
    id: 'rich-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 360,
      width: 420,
      height: 320,
    },
    plainText: 'Rich content',
    editorStateJson,
    style: {
      zIndex: 10,
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
  };
}

describe('exportFlattenedWriterPdf rich blocks', () => {
  it('exports a rich text box containing a table block and image block', async () => {
    const inputPdf = await samplePdf();
    const editorStateJson = JSON.stringify({
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'heading',
            tag: 'h1',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [
              {
                type: 'text',
                version: 1,
                text: 'Rich Export Test',
                format: 0,
                style: '',
                mode: 'normal',
                detail: 0,
              },
            ],
          },
          {
            type: 'table',
            version: 1,
            children: [
              {
                type: 'tablerow',
                version: 1,
                children: [
                  {
                    type: 'tablecell',
                    version: 1,
                    children: [
                      {
                        type: 'paragraph',
                        version: 1,
                        children: [
                          {
                            type: 'text',
                            version: 1,
                            text: 'Header A',
                            format: 0,
                            style: '',
                            mode: 'normal',
                            detail: 0,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tablecell',
                    version: 1,
                    children: [
                      {
                        type: 'paragraph',
                        version: 1,
                        children: [
                          {
                            type: 'text',
                            version: 1,
                            text: 'Header B',
                            format: 0,
                            style: '',
                            mode: 'normal',
                            detail: 0,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'tablerow',
                version: 1,
                children: [
                  {
                    type: 'tablecell',
                    version: 1,
                    children: [
                      {
                        type: 'paragraph',
                        version: 1,
                        children: [
                          {
                            type: 'text',
                            version: 1,
                            text: 'Cell A1',
                            format: 0,
                            style: '',
                            mode: 'normal',
                            detail: 0,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tablecell',
                    version: 1,
                    children: [
                      {
                        type: 'paragraph',
                        version: 1,
                        children: [
                          {
                            type: 'text',
                            version: 1,
                            text: 'Cell B1',
                            format: 0,
                            style: '',
                            mode: 'normal',
                            detail: 0,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'inline-image',
            version: 1,
            src: ONE_BY_ONE_PNG,
            altText: 'Tiny test image',
            width: 80,
            height: 40,
            caption: 'Image caption',
          },
        ],
      },
    });

    const result = await exportFlattenedWriterPdf({
      pdfBytes: inputPdf,
      elements: [richElement(editorStateJson)],
      assets: [],
    });

    expect(result.pageCount).toBe(1);
    expect(result.flattenedElementCount).toBe(1);
    expect(result.bytes.length).toBeGreaterThan(inputPdf.length);

    const outputPdf = await PDFDocument.load(result.bytes);
    expect(outputPdf.getPageCount()).toBe(1);
  });
});
