import { describe, expect, it } from 'vitest';
import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
  probeWriterImageDimensions,
  sniffWriterImageFormat,
  WRITER_IMAGE_ADMISSION_LIMITS,
  WriterImageAdmissionError,
} from './writerImageAdmission';

// Real fixtures generated via headless Chromium canvas.toBlob(), captured once
// and embedded here so these tests don't depend on a browser at test time.
// PNG 37x53, JPEG 101x77, WebP (VP8X container, from canvas export) 64x48.
const REAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACUAAAA1CAYAAADGSCKYAAAAhUlEQVR4AezSsQ3AIBBDUYvJslmSzbIZERv8wkIUH3Sdi9M7j5nM02bkwOdS9ChKKUUFaM5OKUUFaM5OKUUFaM5OKUUFaM5OKUUFaM5ObZf6cuUp/dr51lJv7jSmtlSKz6UoplJKUQGas1NKUQGas1NKUQGas1NKUQGas1NU6gcAAP//ZeibEQAAAAZJREFUAwBqVXAh69j5+gAAAABJRU5ErkJggg==';
const REAL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCABNAGUDASIAAhEBAxEB/8QAGQABAQEAAwAAAAAAAAAAAAAAAAcGAwUI/8QAJBABAAADCQEAAwAAAAAAAAAAAAEDBAIGBxY2VXORsQUREiH/xAAYAQEBAQEBAAAAAAAAAAAAAAAACQYHCP/EACgRAAEBBQcFAQEAAAAAAAAAAAABAgMEBhEFBxg2VKPSCHFzdLISE//aAAwDAQACEQMRAD8A86AOGFUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6+tvB8b50+NNXfRlSZsIQj+tqP9/EXBm67W8U/cWAxG1Lb4ZfjMPckjdLkuTTLcDbUTGP2W37phtUZ/nRFaRFVEqwq07qeOZx6jrflyYIyyIeEctMOXjTCKv7qqMrSq0aRK9kLNm67W8U/cTN12t4p+4oyNVg9lXXRG3wM1ipmTRONzmWbN12t4p+4mbrtbxT9xRkMHsq66I2+AxUzJonG5zLNm67W8U/cRGQweyrrojb4DFTMmicbnMvoCeJ7rAAAAAlOI2pbfDL8Zhp8RtS2+GX4zCv8AdBkKx/XdfKEsr0862p53n0oAdHMCAAAABfQEOSxYAAAAEpxG1Lb4ZfjMNPiNqW3wy/GYV/ugyFY/ruvlCWV6edbU87z6UAOjmBAAAAA//9k=';
const REAL_WEBP_VP8X_BASE64 =
  'UklGRkYCAABXRUJQVlA4WAoAAAAgAAAAPwAALwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggWAAAAFAFAJ0BKkAAMAA+bTKURyQjIiEqqACADYljANNdwP4B+AGmA/AD9VQCz+VQ7v/EaosTAAD+8JsegugiTv/yfQ+Ipf+PfYdmXpF+sDeYHHqk2PRQNifgAAA=';

function bytesFromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(globalThis.atob(base64), (char) => char.charCodeAt(0));
}

function fileFromBase64(base64: string, mimeType: string, name: string): File {
  const bytes = bytesFromBase64(base64);
  return new File([bytes], name, { type: mimeType });
}

function buildPngWithDimensions(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

// Hand-constructed per the WebP spec (not verified against a live encoder,
// unlike the VP8X fixture above): simple lossy VP8 container.
function buildSimpleVp8(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x00, 0x00, 0x00, 0x00], 4); // size (unused by probe)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  bytes.set([0x00, 0x00, 0x00, 0x00], 16); // chunk size (unused by probe)
  // bitstream: 3-byte frame tag (unused by probe) + start code + width/height
  bytes.set([0x00, 0x00, 0x00], 20);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0x3f;
  return bytes;
}

describe('sniffWriterImageFormat', () => {
  it('identifies PNG, JPEG, and WebP by byte signature', () => {
    expect(sniffWriterImageFormat(bytesFromBase64(REAL_PNG_BASE64))).toBe('png');
    expect(sniffWriterImageFormat(bytesFromBase64(REAL_JPEG_BASE64))).toBe('jpeg');
    expect(sniffWriterImageFormat(bytesFromBase64(REAL_WEBP_VP8X_BASE64))).toBe('webp');
  });

  it('does not trust a spoofed extension or MIME type', () => {
    const notAnImage = new TextEncoder().encode('<svg></svg>');
    expect(sniffWriterImageFormat(notAnImage)).toBeNull();
  });
});

describe('probeWriterImageDimensions', () => {
  it('reads real PNG/JPEG/WebP dimensions matching what the encoder produced', () => {
    expect(probeWriterImageDimensions(bytesFromBase64(REAL_PNG_BASE64), 'png')).toMatchObject({
      width: 37,
      height: 53,
    });
    expect(probeWriterImageDimensions(bytesFromBase64(REAL_JPEG_BASE64), 'jpeg')).toMatchObject({
      width: 101,
      height: 77,
    });
    expect(probeWriterImageDimensions(bytesFromBase64(REAL_WEBP_VP8X_BASE64), 'webp')).toMatchObject({
      width: 64,
      height: 48,
      animated: false,
    });
  });

  it('reads dimensions from a simple (non-extended) VP8 WebP container', () => {
    expect(probeWriterImageDimensions(buildSimpleVp8(320, 240), 'webp')).toMatchObject({
      width: 320,
      height: 240,
    });
  });
});

describe('admitWriterImageFile', () => {
  it('admits a real, in-bounds PNG', async () => {
    const file = fileFromBase64(REAL_PNG_BASE64, 'image/png', 'a.png');
    const admitted = await admitWriterImageFile(file);
    expect(admitted.width).toBe(37);
    expect(admitted.height).toBe(53);
    expect(admitted.format).toBe('png');
    expect(admitted.evidence.admissionOutcome).toBe('ADMITTED');
    expect(Object.isFrozen(admitted.evidence)).toBe(true);

    const dataUrl = encodeWriterImageDataUrl(admitted);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects a file whose extension/MIME claims image/png but whose bytes are not a real image, before ever probing dimensions', async () => {
    const fakeFile = new File([new TextEncoder().encode('not an image')], 'fake.png', { type: 'image/png' });
    await expect(admitWriterImageFile(fakeFile)).rejects.toThrow(WriterImageAdmissionError);
    await expect(admitWriterImageFile(fakeFile)).rejects.toThrow(/PNG, JPEG, and WebP/i);
  });

  it('rejects a decompression-bomb-shaped PNG (tiny file, enormous declared dimensions) before any canvas allocation', async () => {
    // A PNG whose IHDR claims a huge width/height. If this were decoded (new
    // Image() + canvas draw), it would attempt to allocate width*height*4
    // bytes of pixel data. admitWriterImageFile must reject on the header
    // alone -- it never constructs an Image or Canvas.
    const bombBytes = buildPngWithDimensions(50_000, 50_000);
    const file = new File([bombBytes], 'bomb.png', { type: 'image/png' });

    await expect(admitWriterImageFile(file)).rejects.toThrow(WriterImageAdmissionError);
    await expect(admitWriterImageFile(file)).rejects.toThrow(/width|pixels/i);
  });

  it('rejects an oversized source file by size before reading its bytes', async () => {
    let arrayBufferCalled = false;
    const oversizedFile = new File([bytesFromBase64(REAL_PNG_BASE64)], 'big.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', {
      value: WRITER_IMAGE_ADMISSION_LIMITS.maxSourceBytes + 1,
    });
    const originalArrayBuffer = oversizedFile.arrayBuffer.bind(oversizedFile);
    oversizedFile.arrayBuffer = async () => {
      arrayBufferCalled = true;
      return originalArrayBuffer();
    };

    await expect(admitWriterImageFile(oversizedFile)).rejects.toThrow(WriterImageAdmissionError);
    expect(arrayBufferCalled).toBe(false);
  });

  it('rejects when the document would exceed the aggregate asset budget', async () => {
    const file = fileFromBase64(REAL_PNG_BASE64, 'image/png', 'a.png');
    await expect(
      admitWriterImageFile(file, {
        existingAggregateAssetBytes: WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes,
      }),
    ).rejects.toThrow(/aggregate|total image asset size/i);
  });

  it('honors an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = fileFromBase64(REAL_PNG_BASE64, 'image/png', 'a.png');
    await expect(admitWriterImageFile(file, { signal: controller.signal })).rejects.toThrow(/cancelled/i);
  });
});
