import type { SelectBoxCopyResult } from './types';

export type SelectBoxCopyMode =
  | 'plain'
  | 'formatted'
  | 'table'
  | 'image';

export async function writeSelectBoxCopyToClipboard(
  result: SelectBoxCopyResult,
  mode: SelectBoxCopyMode,
): Promise<void> {
  if (mode === 'plain') {
    await writePlainText(result.plainText);
    return;
  }

  if (mode === 'formatted') {
    await writeHtmlAndText(result.html, result.plainText);
    return;
  }

  if (mode === 'table') {
    if (!result.table) {
      await writePlainText(result.plainText);
      return;
    }

    await writeHtmlAndText(result.table.html, result.table.tsv);
    return;
  }

  if (mode === 'image') {
    if (!result.imageDataUrl) {
      throw new Error('Select Box Copy image snapshot is not available.');
    }

    await writeImage(result.imageDataUrl);
  }
}

async function writePlainText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function writeHtmlAndText(html: string, text: string): Promise<void> {
  if ('ClipboardItem' in globalThis && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(text);
}

async function writeImage(dataUrl: string): Promise<void> {
  if (!('ClipboardItem' in globalThis) || !navigator.clipboard.write) {
    throw new Error('Image clipboard write is not supported in this browser.');
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': dataUrlToBlob(dataUrl),
    }),
  ]);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');

  if (!meta || !base64) {
    throw new Error('Invalid Select Box Copy image data URL.');
  }

  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}