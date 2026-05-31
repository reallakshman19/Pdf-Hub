import { describe, expect, it } from 'vitest';
import { safeDownloadBaseName } from './downloadWriterFile';

describe('writer-v2 download helpers', () => {
  it('creates safe download base names', () => {
    expect(safeDownloadBaseName('My Drawing FINAL.pdf')).toBe('My-Drawing-FINAL');
    expect(safeDownloadBaseName('')).toBe('document');
    expect(safeDownloadBaseName('../bad/name.pdf')).toBe('..-bad-name');
  });
});