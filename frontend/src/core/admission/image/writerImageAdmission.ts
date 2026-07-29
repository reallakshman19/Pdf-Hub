import { throwIfAborted } from '@/core/cancellation/operationCancellation';

export const WRITER_IMAGE_ADMISSION_LIMITS = Object.freeze({
  /** File.size / ArrayBuffer.byteLength, checked before any decode. */
  maxSourceBytes: 20 * 1024 * 1024,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxTotalPixels: 40_000_000,
  /** width * height * 4 (RGBA), the memory a canvas draw would allocate. */
  maxProjectedDecodedBytes: 200 * 1024 * 1024,
  /** Approximate base64 data URL size once retained in the asset store. */
  maxProjectedDataUrlBytes: 30 * 1024 * 1024,
  /** Sum of all Writer image asset data URL lengths kept in one document. */
  maxAggregateAssetBytes: 150 * 1024 * 1024,
});

export type WriterImageFormat = 'png' | 'jpeg' | 'webp';

export type WriterImageAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_SOURCE_BYTES'
  | 'REJECTED_FORMAT'
  | 'REJECTED_DIMENSIONS_UNREADABLE'
  | 'REJECTED_ANIMATED'
  | 'REJECTED_WIDTH'
  | 'REJECTED_HEIGHT'
  | 'REJECTED_TOTAL_PIXELS'
  | 'REJECTED_PROJECTED_DECODED_BYTES'
  | 'REJECTED_PROJECTED_DATA_URL_BYTES'
  | 'REJECTED_AGGREGATE_ASSET_BYTES';

export interface WriterImageAdmissionMeasurement {
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
}

export class WriterImageAdmissionError extends Error {
  readonly outcome: WriterImageAdmissionOutcome;
  readonly measured?: WriterImageAdmissionMeasurement;

  constructor(outcome: WriterImageAdmissionOutcome, message: string, measured?: WriterImageAdmissionMeasurement) {
    super(message);
    this.name = 'WriterImageAdmissionError';
    this.outcome = outcome;
    this.measured = measured ? Object.freeze({ ...measured }) : undefined;
  }
}

export interface WriterImageAdmissionEvidence {
  readonly evidenceProfileId: 'WRITER_IMAGE_ADMISSION_EVIDENCE_V1';
  readonly limits: typeof WRITER_IMAGE_ADMISSION_LIMITS;
  readonly format: WriterImageFormat;
  readonly sourceBytes: number;
  readonly width: number;
  readonly height: number;
  readonly projectedDecodedBytes: number;
  readonly projectedDataUrlBytes: number;
  readonly aggregateAssetBytesBefore: number;
  readonly aggregateAssetBytesAfter: number;
  readonly admissionOutcome: WriterImageAdmissionOutcome;
}

export interface AdmittedWriterImage {
  readonly format: WriterImageFormat;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly evidence: WriterImageAdmissionEvidence;
}

/** Byte-signature ("magic number") detection. Never trusts File.type/extension. */
export function sniffWriterImageFormat(bytes: Uint8Array): WriterImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50   // WEBP
  ) {
    return 'webp';
  }

  return null;
}

interface ProbedDimensions {
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
}

function probePngDimensions(bytes: Uint8Array): ProbedDimensions | null {
  // Signature (8 bytes) + length (4) + "IHDR" (4) + width (4, BE) + height (4, BE).
  if (bytes.length < 24) return null;
  if (!(bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52)) return null;

  const width = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
  const height = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
  if (width <= 0 || height <= 0) return null;
  return { width, height, animated: false };
}

function probeJpegDimensions(bytes: Uint8Array): ProbedDimensions | null {
  let index = 2; // skip SOI (FF D8)
  let markerCount = 0;

  while (index < bytes.length - 1 && markerCount < 512) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    markerCount += 1;

    // Standalone markers with no length field.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    if (marker === 0xff) {
      index += 1;
      continue;
    }
    if (index + 4 > bytes.length) return null;
    const length = (bytes[index + 2] << 8) | bytes[index + 3];

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (index + 9 > bytes.length) return null;
      const height = (bytes[index + 5] << 8) | bytes[index + 6];
      const width = (bytes[index + 7] << 8) | bytes[index + 8];
      if (width <= 0 || height <= 0) return null;
      return { width, height, animated: false };
    }

    index += 2 + length;
  }

  return null;
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function probeWebpDimensions(bytes: Uint8Array): ProbedDimensions | null {
  if (bytes.length < 16) return null;
  const fourCc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (fourCc === 'VP8X') {
    if (bytes.length < 30) return null;
    const flags = bytes[20];
    const animated = (flags & 0x02) !== 0;
    const width = readUInt24LE(bytes, 24) + 1;
    const height = readUInt24LE(bytes, 27) + 1;
    if (width <= 0 || height <= 0) return null;
    return { width, height, animated };
  }

  if (fourCc === 'VP8 ') {
    // Bitstream: 3-byte frame tag, 3-byte start code (9D 01 2A), then
    // 2-byte width and 2-byte height (14 bits each, little-endian).
    const bitstreamStart = 20;
    if (bytes.length < bitstreamStart + 10) return null;
    if (bytes[bitstreamStart + 3] !== 0x9d || bytes[bitstreamStart + 4] !== 0x01 || bytes[bitstreamStart + 5] !== 0x2a) {
      return null;
    }
    const widthField = bytes[bitstreamStart + 6] | (bytes[bitstreamStart + 7] << 8);
    const heightField = bytes[bitstreamStart + 8] | (bytes[bitstreamStart + 9] << 8);
    const width = widthField & 0x3fff;
    const height = heightField & 0x3fff;
    if (width <= 0 || height <= 0) return null;
    return { width, height, animated: false };
  }

  if (fourCc === 'VP8L') {
    const dataStart = 20;
    if (bytes.length < dataStart + 5 || bytes[dataStart] !== 0x2f) return null;
    const bits =
      (bytes[dataStart + 1] |
        (bytes[dataStart + 2] << 8) |
        (bytes[dataStart + 3] << 16) |
        (bytes[dataStart + 4] << 24)) >>> 0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    if (width <= 0 || height <= 0) return null;
    return { width, height, animated: false };
  }

  return null;
}

/**
 * Bounded dimension probe: reads width/height/animation from the format's
 * header only. Never decodes pixel data -- this must run, and reject,
 * before any canvas/<img> decode is ever attempted, or a decompression-bomb
 * image (tiny file, enormous pixel buffer) would already have been decoded
 * by the time dimensions became known.
 */
export function probeWriterImageDimensions(
  bytes: Uint8Array,
  format: WriterImageFormat,
): ProbedDimensions | null {
  if (format === 'png') return probePngDimensions(bytes);
  if (format === 'jpeg') return probeJpegDimensions(bytes);
  return probeWebpDimensions(bytes);
}

export interface AdmitWriterImageOptions {
  readonly signal?: AbortSignal;
  /** Sum of dataUrl.length for every existing asset in the target document. */
  readonly existingAggregateAssetBytes?: number;
}

/**
 * The one shared boundary for admitting an image file into a Writer V2
 * document: metadata -> byte signature -> bounded dimension probe -> pixel
 * decision -> (caller decodes/encodes only after this resolves). Every
 * active image-ingestion path (upload, drag-drop, paste, replace,
 * rich-content insert) must go through this before creating a
 * WriterAssetRecordV2.
 */
export async function admitWriterImageFile(
  file: File,
  options: AdmitWriterImageOptions = {},
): Promise<AdmittedWriterImage> {
  throwIfAborted(options.signal, 'admit Writer image');

  if (file.size > WRITER_IMAGE_ADMISSION_LIMITS.maxSourceBytes) {
    throw new WriterImageAdmissionError(
      'REJECTED_SOURCE_BYTES',
      `Image is too large (${file.size} bytes); limit is ${WRITER_IMAGE_ADMISSION_LIMITS.maxSourceBytes} bytes.`,
      { metric: 'sourceBytes', actual: file.size, limit: WRITER_IMAGE_ADMISSION_LIMITS.maxSourceBytes },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(options.signal, 'admit Writer image');

  const format = sniffWriterImageFormat(bytes);
  if (!format) {
    throw new WriterImageAdmissionError(
      'REJECTED_FORMAT',
      'Only PNG, JPEG, and WebP images are supported (checked by byte signature, not file extension).',
    );
  }

  const dimensions = probeWriterImageDimensions(bytes, format);
  if (!dimensions) {
    throw new WriterImageAdmissionError(
      'REJECTED_DIMENSIONS_UNREADABLE',
      `Could not determine ${format.toUpperCase()} image dimensions from its header.`,
    );
  }
  if (dimensions.animated) {
    throw new WriterImageAdmissionError('REJECTED_ANIMATED', 'Animated images are not supported.');
  }

  const { width, height } = dimensions;
  if (width > WRITER_IMAGE_ADMISSION_LIMITS.maxWidth) {
    throw new WriterImageAdmissionError(
      'REJECTED_WIDTH',
      `Image width ${width}px exceeds the ${WRITER_IMAGE_ADMISSION_LIMITS.maxWidth}px limit.`,
      { metric: 'width', actual: width, limit: WRITER_IMAGE_ADMISSION_LIMITS.maxWidth },
    );
  }
  if (height > WRITER_IMAGE_ADMISSION_LIMITS.maxHeight) {
    throw new WriterImageAdmissionError(
      'REJECTED_HEIGHT',
      `Image height ${height}px exceeds the ${WRITER_IMAGE_ADMISSION_LIMITS.maxHeight}px limit.`,
      { metric: 'height', actual: height, limit: WRITER_IMAGE_ADMISSION_LIMITS.maxHeight },
    );
  }

  const totalPixels = width * height;
  if (totalPixels > WRITER_IMAGE_ADMISSION_LIMITS.maxTotalPixels) {
    throw new WriterImageAdmissionError(
      'REJECTED_TOTAL_PIXELS',
      `Image has ${totalPixels} total pixels; limit is ${WRITER_IMAGE_ADMISSION_LIMITS.maxTotalPixels}.`,
      { metric: 'totalPixels', actual: totalPixels, limit: WRITER_IMAGE_ADMISSION_LIMITS.maxTotalPixels },
    );
  }

  const projectedDecodedBytes = totalPixels * 4;
  if (projectedDecodedBytes > WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDecodedBytes) {
    throw new WriterImageAdmissionError(
      'REJECTED_PROJECTED_DECODED_BYTES',
      `Decoding this image would allocate ~${projectedDecodedBytes} bytes; limit is ` +
      `${WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDecodedBytes}.`,
      {
        metric: 'projectedDecodedBytes',
        actual: projectedDecodedBytes,
        limit: WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDecodedBytes,
      },
    );
  }

  // Base64 expands raw bytes by ~4/3; the data: URL prefix adds a small,
  // roughly constant overhead we don't need to model precisely for a bound.
  const projectedDataUrlBytes = Math.ceil(bytes.length * 4 / 3) + 32;
  if (projectedDataUrlBytes > WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDataUrlBytes) {
    throw new WriterImageAdmissionError(
      'REJECTED_PROJECTED_DATA_URL_BYTES',
      `Retaining this image as a data URL would take ~${projectedDataUrlBytes} bytes; limit is ` +
      `${WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDataUrlBytes}.`,
      {
        metric: 'projectedDataUrlBytes',
        actual: projectedDataUrlBytes,
        limit: WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDataUrlBytes,
      },
    );
  }

  const aggregateAssetBytesBefore = options.existingAggregateAssetBytes ?? 0;
  const aggregateAssetBytesAfter = aggregateAssetBytesBefore + projectedDataUrlBytes;
  if (aggregateAssetBytesAfter > WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes) {
    throw new WriterImageAdmissionError(
      'REJECTED_AGGREGATE_ASSET_BYTES',
      `Adding this image would bring the document's total image asset size to ` +
      `~${aggregateAssetBytesAfter} bytes; limit is ${WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes}.`,
      {
        metric: 'aggregateAssetBytes',
        actual: aggregateAssetBytesAfter,
        limit: WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes,
      },
    );
  }

  throwIfAborted(options.signal, 'admit Writer image');

  const evidence: WriterImageAdmissionEvidence = Object.freeze({
    evidenceProfileId: 'WRITER_IMAGE_ADMISSION_EVIDENCE_V1',
    limits: WRITER_IMAGE_ADMISSION_LIMITS,
    format,
    sourceBytes: bytes.length,
    width,
    height,
    projectedDecodedBytes,
    projectedDataUrlBytes,
    aggregateAssetBytesBefore,
    aggregateAssetBytesAfter,
    admissionOutcome: 'ADMITTED',
  });

  return {
    format,
    mimeType: `image/${format === 'jpeg' ? 'jpeg' : format}` as AdmittedWriterImage['mimeType'],
    width,
    height,
    bytes,
    evidence,
  };
}

/** Encodes admitted bytes as a data: URL. Call only after admitWriterImageFile resolves. */
export function encodeWriterImageDataUrl(admitted: AdmittedWriterImage): string {
  let binary = '';
  for (const byte of admitted.bytes) binary += String.fromCharCode(byte);
  return `data:${admitted.mimeType};base64,${globalThis.btoa(binary)}`;
}
