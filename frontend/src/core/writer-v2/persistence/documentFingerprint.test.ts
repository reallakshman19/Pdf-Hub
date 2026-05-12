import { describe, expect, it } from 'vitest';
import {
  documentFingerprintFromBytes,
  documentFingerprintFromFileLike,
} from './documentFingerprint';

describe('writer-v2 documentFingerprint', () => {
  it('returns deterministic SHA-256 fingerprints for the same bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const a = await documentFingerprintFromBytes(bytes);
    const b = await documentFingerprintFromBytes(new Uint8Array([1, 2, 3, 4, 5]));

    expect(a).toBe(b);
    expect(a.startsWith('sha256:')).toBe(true);
  });

  it('changes fingerprint when bytes change', async () => {
    const a = await documentFingerprintFromBytes(new Uint8Array([1, 2, 3]));
    const b = await documentFingerprintFromBytes(new Uint8Array([1, 2, 4]));

    expect(a).not.toBe(b);
  });

  it('adds stable normalized file-name suffix when provided', async () => {
    const fingerprint = await documentFingerprintFromFileLike({
      name: 'My Report FINAL.pdf',
      bytes: new Uint8Array([9, 8, 7]),
    });

    expect(fingerprint).toContain(':my-report-final.pdf');
  });
});
