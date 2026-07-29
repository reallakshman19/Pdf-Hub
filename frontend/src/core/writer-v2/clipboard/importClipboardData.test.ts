import { describe, expect, it } from 'vitest';
import { importClipboardDataForWriter } from './importClipboardData';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function realPngFile(name = 'screenshot.png'): File {
  const bytes = Uint8Array.from(atob(ONE_BY_ONE_PNG), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

function clipboardStub(input: {
  html?: string;
  text?: string;
  files?: File[];
}): Pick<DataTransfer, 'getData' | 'files' | 'items'> {
  return {
    getData(type: string) {
      if (type === 'text/html') return input.html ?? '';
      if (type === 'text/plain') return input.text ?? '';
      return '';
    },
    files: (input.files ?? []) as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
  };
}

describe('importClipboardDataForWriter', () => {
  it('imports sanitized html and table metadata', async () => {
    const result = await importClipboardDataForWriter(
      clipboardStub({
        html: `
          <table><tr><td>A</td><td>B</td></tr></table>
          <script>alert(1)</script>
        `,
        text: 'A\tB',
      }),
      'doc-1',
    );

    expect(result.source).toBe('mixed');
    expect(result.sanitizedHtml).not.toContain('<script');
    expect(result.hasTable).toBe(true);
    expect(result.tableData?.rows[0].cells[0].text).toBe('A');
  });

  it('imports plain text fallback', async () => {
    const result = await importClipboardDataForWriter(
      clipboardStub({
        text: 'plain text only',
      }),
      'doc-1',
    );

    expect(result.source).toBe('text');
    expect(result.plainText).toBe('plain text only');
    expect(result.assets).toEqual([]);
  });

  it('imports image files as asset records', async () => {
    const result = await importClipboardDataForWriter(
      clipboardStub({
        files: [realPngFile()],
      }),
      'doc-1',
    );

    expect(result.source).toBe('image');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].documentFingerprint).toBe('doc-1');
    expect(result.assets[0].mimeType).toBe('image/png');
    expect(result.assets[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.assets[0].width).toBe(1);
    expect(result.assets[0].height).toBe(1);
  });

  it('skips a pasted file that is not a real image (bad byte signature) instead of failing the paste', async () => {
    const notAnImage = new File(['fake'], 'screenshot.png', { type: 'image/png' });

    const result = await importClipboardDataForWriter(
      clipboardStub({
        files: [notAnImage],
      }),
      'doc-1',
    );

    expect(result.assets).toEqual([]);
    expect(result.source).toBe('empty');
  });
});
