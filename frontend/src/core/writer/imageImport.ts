import type {
  WriterImageModel,
} from './types';
import {
  createImageModel,
} from './content-model';

export async function fileToWriterImageModel(file: File): Promise<WriterImageModel> {
  if (!isSupportedWriterImageMime(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  }

  const src = await blobToDataUrl(file);
  const size = await readImageSize(src);

  return createImageModel({
    src,
    mimeType: file.type,
    naturalWidth: size.width,
    naturalHeight: size.height,
    alt: file.name,
  });
}

export function isSupportedWriterImageMime(mimeType: string): boolean {
  return /^image\/(png|jpeg|jpg|webp)$/i.test(mimeType);
}

export function extractImageFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) =>
    isSupportedWriterImageMime(file.type),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
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
