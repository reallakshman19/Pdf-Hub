import {
  admitWriterImageFile,
  WriterImageAdmissionError,
} from '@/core/admission/image/writerImageAdmission';

export interface AdmittedHeaderFooterImage {
  resourceId: string;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  bytes: Uint8Array;
}

export async function admitHeaderFooterImageFile(
  file: File,
  signal?: AbortSignal,
): Promise<AdmittedHeaderFooterImage> {
  const admitted = await admitWriterImageFile(file, { signal });

  if (admitted.format === 'webp') {
    throw new WriterImageAdmissionError(
      'REJECTED_FORMAT',
      'Header/footer images currently support PNG and JPEG only.',
    );
  }

  return {
    resourceId: createHeaderFooterImageResourceId(),
    fileName: file.name || 'image',
    mimeType:
      admitted.format === 'png'
        ? 'image/png'
        : 'image/jpeg',
    width: admitted.width,
    height: admitted.height,
    bytes: admitted.bytes,
  };
}

export function createHeaderFooterImageResourceId(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `header-footer-image:${suffix}`;
}