import type { WriterImageModel } from '../types';
import { createImageModel } from '../content-model';

export async function blobToClipboardImage(blob: Blob, alt?: string): Promise<WriterImageModel> {
  const src = await blobToDataUrl(blob);
  const size = await readImageSize(src);

  return createImageModel({
    src,
    mimeType: blob.type || inferMimeType(src) || 'image/png',
    naturalWidth: size.width,
    naturalHeight: size.height,
    alt,
  });
}

export function isClipboardImageType(type: string): boolean {
  return /^image\/(png|jpeg|jpg|webp|gif)$/i.test(type);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({ width: 0, height: 0 });
  }

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

function inferMimeType(src: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/i.exec(src);
  return match?.[1];
}
