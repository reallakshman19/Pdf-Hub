import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterElementV2 } from '../../types';
import { WRITER_PAGE_PRESETS } from '../../types';
import { useWriterV2Store } from '../../writerV2Store';
import {
  cssHexToPdfRgb,
  exportCurrentWriterPdf,
} from '../exportCurrentWriterPdf';
import { exportLiveBlankWriterDocx } from '../exportLiveBlankWriterDocx';

describe('blank Writer document exports', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('exports blank Writer document to PDF with configured page count and size', async () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-export-pdf',
      pageSetup: {
        ...WRITER_PAGE_PRESETS.Letter,
        backgroundColor: '#f8fafc',
      },
      pageCount: 2,
      now: '2026-01-01T00:00:00.000Z',
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: makeElement('writer-blank-pdf-1', 1, 'Blank PDF export text'),
    });

    const bytes = await exportCurrentWriterPdf();
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();

    expect(pages).toHaveLength(2);
    expect(pages[0].getWidth()).toBe(612);
    expect(pages[0].getHeight()).toBe(792);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('converts CSS hex background color to pdf-lib RGB', async () => {
    expect(await cssHexToPdfRgb('#ffffff')).toMatchObject({
      red: 1,
      green: 1,
      blue: 1,
    });
    expect(await cssHexToPdfRgb('#000000')).toMatchObject({
      red: 0,
      green: 0,
      blue: 0,
    });
    expect(await cssHexToPdfRgb('not-a-color')).toBeNull();
  });

  it('exports blank Writer document to DOCX with page setup and expected text', async () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      title: 'Blank DOCX Export',
      documentFingerprint: 'blank-export-docx',
      pageSetup: WRITER_PAGE_PRESETS.Letter,
      pageCount: 1,
      now: '2026-01-01T00:00:00.000Z',
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: makeElement('writer-blank-docx-1', 0, 'Blank DOCX export text'),
    });

    const result = await exportLiveBlankWriterDocx();
    const zip = await JSZip.loadAsync(result.bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    const stylesXml = await zip.file('word/styles.xml')?.async('string');
    const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');

    expect(result.fatal).toBe(false);
    expect(contentTypesXml).toBeTruthy();
    expect(documentXml).toContain('Blank DOCX export text');
    expect(documentXml).toContain('w:w="12240"');
    expect(documentXml).toContain('w:h="15840"');
    expect(documentXml).toContain('w:left="1440"');
    expect(stylesXml).toBeTruthy();
    expect(documentXml).not.toContain('[object Object]');
    expect(documentXml).not.toContain('Ã');
  });
});

function makeElement(
  id: string,
  pageIndex: number,
  plainText: string,
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'blank-export-doc',
    pageIndex,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 600,
      width: 260,
      height: 96,
    },
    plainText,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      fontSize: 12,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
