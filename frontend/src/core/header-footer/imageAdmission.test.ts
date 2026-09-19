import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import {
  admitHeaderFooterImageFile,
} from './imageAdmission';

const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  ),
);

function minimalWebpVp8x(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  bytes[24] = 0; // width - 1 = 0 => 1px
  bytes[27] = 0; // height - 1 = 0 => 1px
  return bytes;
}

describe('header/footer image admission', () => {
  it('admits a byte-verified PNG without converting it to a data URL', async () => {
    const file = new File([PNG_BYTES], 'logo.png', {
      type: 'application/octet-stream',
    });

    const result = await admitHeaderFooterImageFile(file);

    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.resourceId).toMatch(/^header-footer-image:/);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes).toEqual(PNG_BYTES);
  });

  it('rejects WebP even though the shared bounded image probe can read it', async () => {
    const file = new File([minimalWebpVp8x()], 'logo.webp', {
      type: 'image/webp',
    });

    await expect(
      admitHeaderFooterImageFile(file),
    ).rejects.toThrow(/PNG and JPEG only/);
  });

  it('rejects extension spoofing through the shared byte-signature boundary', async () => {
    const file = new File(
      [new TextEncoder().encode('not an image')],
      'logo.png',
      { type: 'image/png' },
    );

    await expect(
      admitHeaderFooterImageFile(file),
    ).rejects.toThrow(/PNG, JPEG, and WebP/);
  });
});
