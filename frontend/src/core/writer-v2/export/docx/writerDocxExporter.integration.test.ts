import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { WriterElementV2 } from '../../types';
import type { WriterAssetRecordV2 } from '../../persistence/indexedDbWriterStore';
import { exportWriterDocx } from '../writerDocxExporter';

const DOCUMENT_FINGERPRINT = 'docx-test-document';

describe('Writer V2 DOCX export integration', () => {
  it('exports paragraphs, headings, lists, tables, page breaks, and images into a valid DOCX ZIP', async () => {
    const elements: WriterElementV2[] = [
      makeWriterElement({
        id: 'heading-1',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 720, width: 400, height: 80 },
        editorStateJson: JSON.stringify({
          root: {
            children: [
              {
                type: 'heading',
                tag: 'h1',
                format: 'center',
                children: [
                  {
                    type: 'text',
                    text: 'Writer DOCX Export',
                    format: 1,
                  },
                ],
              },
            ],
          },
        }),
      }),

      makeWriterElement({
        id: 'paragraph-1',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 640, width: 400, height: 100 },
        editorStateJson: JSON.stringify({
          root: {
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'Hello & XML-safe Writer text',
                    format: 0,
                  },
                  {
                    type: 'linebreak',
                  },
                  {
                    type: 'text',
                    text: 'Bold italic text',
                    format: 3,
                  },
                ],
              },
            ],
          },
        }),
      }),

      makeWriterElement({
        id: 'list-1',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 520, width: 400, height: 100 },
        editorStateJson: JSON.stringify({
          root: {
            children: [
              {
                type: 'list',
                listType: 'number',
                children: [
                  {
                    type: 'listitem',
                    value: 1,
                    children: [
                      {
                        type: 'text',
                        text: 'First numbered item',
                        format: 0,
                      },
                    ],
                  },
                  {
                    type: 'listitem',
                    value: 2,
                    children: [
                      {
                        type: 'text',
                        text: 'Second numbered item',
                        format: 0,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      }),

      makeWriterElement({
        id: 'table-1',
        type: 'tableBox',
        pageIndex: 0,
        rect: { x: 72, y: 360, width: 400, height: 120 },
        tableData: {
          columns: [
            { id: 'col-a', label: 'Column A' },
            { id: 'col-b', label: 'Column B' },
          ],
          rows: [
            {
              id: 'row-1',
              cells: [
                { id: 'cell-a1', text: 'Cell A1' },
                { id: 'cell-b1', text: 'Cell B1' },
              ],
            },
          ],
        },
      }),

      makeWriterElement({
        id: 'page-2-text',
        type: 'richTextBox',
        pageIndex: 1,
        rect: { x: 72, y: 720, width: 400, height: 80 },
        plainText: 'Page two paragraph after page break',
      }),

      makeWriterElement({
        id: 'image-1',
        type: 'imageBox',
        pageIndex: 1,
        rect: { x: 72, y: 560, width: 120, height: 120 },
        imageAssetId: 'asset-image-1',
      }),
    ];

    const assets: WriterAssetRecordV2[] = [
      {
        id: 'asset-image-1',
        documentFingerprint: DOCUMENT_FINGERPRINT,
        kind: 'image',
        mimeType: 'image/png',
        dataUrl: ONE_BY_ONE_PNG_DATA_URL,
        width: 1,
        height: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const result = await exportWriterDocx({
      elements,
      assets,
      title: 'Writer DOCX Integration Test',
    });

    expect(result.fatal).toBe(false);
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    const zip = await JSZip.loadAsync(result.bytes);

    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/styles.xml')).toBeTruthy();
    expect(zip.file('word/_rels/document.xml.rels')).toBeTruthy();

    const mediaFiles = Object.keys(zip.files).filter((path) =>
      path.startsWith('word/media/'),
    );

    expect(mediaFiles.length).toBeGreaterThanOrEqual(1);

    const documentXml = await zip.file('word/document.xml')!.async('string');
    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('string');
    const contentTypesXml = await zip.file('[Content_Types].xml')!.async('string');

    expect(documentXml).toContain('Writer DOCX Export');
    expect(documentXml).toContain('Hello &amp; XML-safe Writer text');
    expect(documentXml).toContain('Bold italic text');
    expect(documentXml).toContain('First numbered item');
    expect(documentXml).toContain('Second numbered item');
    expect(documentXml).toContain('Column A');
    expect(documentXml).toContain('Column B');
    expect(documentXml).toContain('Cell A1');
    expect(documentXml).toContain('Cell B1');
    expect(documentXml).toContain('Page two paragraph after page break');

    expect(documentXml).toMatch(/<w:br[^>]+w:type="page"/);
    expect(documentXml).toMatch(/<w:tbl[\s>]/);
    expect(documentXml).toMatch(/<w:drawing[\s>]/);

    expect(relsXml).toContain('image');
    expect(contentTypesXml).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );

    assertNoDocxCorruption(documentXml);
    assertNoDocxCorruption(relsXml);
    assertNoDocxCorruption(contentTypesXml);
  });

  it('does not crash on malformed editorStateJson and uses plainText fallback', async () => {
    const elements: WriterElementV2[] = [
      makeWriterElement({
        id: 'bad-json',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 720, width: 400, height: 80 },
        editorStateJson: '{not-valid-json}',
        plainText: 'Fallback text from malformed editor state',
      }),
    ];

    const result = await exportWriterDocx({
      elements,
      assets: [],
      title: 'Malformed JSON Fallback Test',
    });

    expect(result.fatal).toBe(false);

    const zip = await JSZip.loadAsync(result.bytes);
    const documentXml = await zip.file('word/document.xml')!.async('string');

    expect(documentXml).toContain('Fallback text from malformed editor state');
    assertNoDocxCorruption(documentXml);
  });

  it('skips hidden elements and exports locked elements normally', async () => {
    const elements: WriterElementV2[] = [
      makeWriterElement({
        id: 'hidden-element',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 720, width: 400, height: 80 },
        plainText: 'This hidden text must not appear',
        hidden: true,
      }),
      makeWriterElement({
        id: 'locked-element',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 620, width: 400, height: 80 },
        plainText: 'Locked text must export normally',
        locked: true,
      }),
    ];

    const result = await exportWriterDocx({
      elements,
      assets: [],
      title: 'Hidden Locked Test',
    });

    expect(result.fatal).toBe(false);
    expect(result.skippedHiddenElementCount).toBe(1);
    expect(result.exportedElementCount).toBe(1);

    const zip = await JSZip.loadAsync(result.bytes);
    const documentXml = await zip.file('word/document.xml')!.async('string');

    expect(documentXml).not.toContain('This hidden text must not appear');
    expect(documentXml).toContain('Locked text must export normally');
    assertNoDocxCorruption(documentXml);
  });
});

function makeWriterElement(
  overrides: Partial<WriterElementV2> & Pick<WriterElementV2, 'id' | 'type'>,
): WriterElementV2 {
  return {
    id: overrides.id,
    documentFingerprint: overrides.documentFingerprint ?? DOCUMENT_FINGERPRINT,
    pageIndex: overrides.pageIndex ?? 0,
    type: overrides.type,
    rect: overrides.rect ?? {
      x: 72,
      y: 720,
      width: 400,
      height: 80,
    },
    editorStateJson: overrides.editorStateJson,
    plainText: overrides.plainText,
    tableData: overrides.tableData,
    imageAssetId: overrides.imageAssetId,
    assetIds: overrides.assetIds,
    review: overrides.review,
    callout: overrides.callout,
    style: {
      zIndex: 0,
      fontSize: 11,
      fontFamily: 'Aptos',
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 8,
      opacity: 1,
      ...overrides.style,
    },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    locked: overrides.locked ?? false,
    hidden: overrides.hidden ?? false,
  };
}

function assertNoDocxCorruption(xml: string): void {
  expect(xml).not.toContain('[object Object]');
  expect(xml).not.toContain('undefined');
  expect(xml).not.toContain('null');

  const mojibakePattern = new RegExp(
    [
      '\\uFFFD',
      '\\u00c3\\u002e',
      '\\u00c2\\u002e',
      '\\u00e2\\u20ac\\u2122',
      '\\u00e2\\u20ac\\u0153',
      '\\u00e2\\u20ac',
      '\\u00e2\\u20ac\\u201c',
      '\\u00e2\\u20ac\\u201d',
      '\\u00e2\\u20ac\\u00a6',
    ].join('|'),
  );
  expect(xml).not.toMatch(mojibakePattern);
}

/**
 * Valid transparent 1x1 PNG.
 */
const ONE_BY_ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
