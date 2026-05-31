import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroExecutionContext } from '../types';
import type { MacroMutableState } from '../registry';
import { macroRegistry } from '../registry';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import './content-ops';

const pngDataUrl =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const jpegDataUrl =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';

vi.mock('../../../adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    drawTextOnPages: vi.fn(async () => new Uint8Array([2, 2, 2])),
    addHeaderFooterText: vi.fn(async () => new Uint8Array([3, 3, 3])),
    insertImage: vi.fn(async () => new Uint8Array([4, 4, 4])),
  },
}));

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toBlob(callback: (blob: Blob | null) => void) {
      callback(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: 'image/png',
      }));
    },
  })),
}));

function ctx(): MacroExecutionContext {
  return {
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 3,
    selectedPages: [2],
    currentPage: 1,
    fileName: 'sample.pdf',
    donorFiles: {
      pngDonor: decodePngDonor(),
    },
    options: {
      abortOnError: true,
    },
  };
}

function state(): MacroMutableState {
  return {
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 3,
    selectedPages: [2],
    templateVars: {},
    logs: [],
    outputFiles: [],
  };
}

function decodePngDonor(): Uint8Array {
  const base64 = pngDataUrl.split(',')[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

describe('content-ops slice 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('draw_text_on_pages sends zero-based page indices', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'draw_text_on_pages',
        selector: {
          mode: 'current',
        },
        text: 'Hello',
        x: 10,
        y: 20,
        fontSize: 12,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.drawTextOnPages).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [0],
      }),
    );
  });

  it('header_footer_text sends zero-based page indices', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'header_footer_text',
        selector: {
          mode: 'all',
        },
        zone: 'footer',
        text: 'Page {page}',
        align: 'center',
        marginX: 20,
        marginY: 20,
        fontSize: 10,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.addHeaderFooterText).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [0, 1, 2],
      }),
    );
  });

  it('registers insert_image and inserts PNG with zero-based page indices', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'insert_image',
        selector: {
          mode: 'selected',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        base64Image: pngDataUrl,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [1],
        mimeType: 'image/png',
      }),
    );
  });

  it('inserts JPEG data URL as image/jpeg', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'insert_image',
        selector: {
          mode: 'current',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        base64Image: jpegDataUrl,
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [0],
        mimeType: 'image/jpeg',
      }),
    );
  });

  it('rejects unsafe data:text/html image source with no side effects', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'adjust_image',
        selector: {
          mode: 'current',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        base64Image: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('error');
    expect(result.sideEffects).toEqual([]);
    expect(PdfEditAdapter.insertImage).not.toHaveBeenCalled();
  });

  it('rejects javascript image source with no side effects', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'adjust_image',
        selector: {
          mode: 'current',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        base64Image: 'javascript:alert(1)',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('error');
    expect(result.sideEffects).toEqual([]);
    expect(PdfEditAdapter.insertImage).not.toHaveBeenCalled();
  });

  it('adjust_image accepts donor PNG and sends zero-based page indices', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'adjust_image',
        selector: {
          mode: 'selected',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        donorFileId: 'pngDonor',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [1],
        mimeType: 'image/png',
      }),
    );
  });

  it('place_rich_textbox rasterizes sanitized HTML and sends zero-based pages', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'place_rich_textbox',
        selector: {
          mode: 'current',
        },
        x: 10,
        y: 20,
        width: 120,
        height: 60,
        content: '<b>Hello</b><script>alert(1)</script>',
        styles: {
          fontSize: 12,
          color: '#111827',
        },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [0],
        mimeType: 'image/png',
      }),
    );
  });

  it('place_rich_textbox tolerates malformed/deep HTML payloads', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'place_rich_textbox',
        selector: { mode: 'current' },
        x: 5,
        y: 5,
        width: 180,
        height: 90,
        content: '<table><tr><td><div><span>Broken<div><script>alert(1)</script></span></td></tr></table>',
        styles: { fontSize: 12, color: '#111827' },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ pages: [0], mimeType: 'image/png' }),
    );
  });

  it('place_table rasterizes table and sends zero-based pages', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'place_table',
        selector: {
          mode: 'selected',
        },
        x: 10,
        y: 20,
        width: 200,
        tableData: {
          columns: [
            {
              id: 'c1',
              label: 'Name',
            },
          ],
          rows: [
            {
              id: 'r1',
              cells: [
                {
                  id: 'cell1',
                  text: 'Pump',
                },
              ],
            },
          ],
          style: {
            borderColor: '#d1d5db',
            headerBg: '#f1f5f9',
            fontSize: 11,
          },
        },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [1],
        mimeType: 'image/png',
      }),
    );
  });

  it('place_table supports deeply nested and multiline cell content safely', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'place_table',
        selector: { mode: 'current' },
        x: 12,
        y: 16,
        width: 260,
        tableData: {
          columns: [{ id: 'c1', label: 'Nested' }, { id: 'c2', label: 'Script' }],
          rows: [
            {
              id: 'r1',
              cells: [
                { id: 'r1c1', text: '<div><table><tr><td>deep</td></tr></table></div>' },
                { id: 'r1c2', text: '<img src=x onerror=alert(1)>\nline2' },
              ],
            },
          ],
          style: { borderColor: '#d1d5db', headerBg: '#f1f5f9', fontSize: 11 },
        },
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('success');
    expect(PdfEditAdapter.insertImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ pages: [0], mimeType: 'image/png' }),
    );
  });

  it('missing donor image returns error and no side effects', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'insert_image',
        selector: {
          mode: 'current',
        },
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        donorFileId: 'missing',
      },
      ctx(),
      state(),
    );

    expect(result.status).toBe('error');
    expect(result.sideEffects).toEqual([]);
    expect(PdfEditAdapter.insertImage).not.toHaveBeenCalled();
  });
});
