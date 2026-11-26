import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyPdfPasswordError,
  clearAllPdfPasswords,
  clearPdfPasswordForDocumentKey,
  getPdfPasswordForDocumentKey,
  normalizePdfPasswordKey,
  setPdfPasswordForDocumentKey,
} from './passwordRegistry';

describe('passwordRegistry', () => {
  beforeEach(() => {
    clearAllPdfPasswords();
  });

  it('normalizes sha256: prefixed and bare document keys identically', () => {
    expect(normalizePdfPasswordKey('sha256:abcdef')).toBe('abcdef');
    expect(normalizePdfPasswordKey('abcdef')).toBe('abcdef');

    setPdfPasswordForDocumentKey('sha256:doc-123', 'secret-pw');
    expect(getPdfPasswordForDocumentKey('doc-123')).toBe('secret-pw');
    expect(getPdfPasswordForDocumentKey('sha256:doc-123')).toBe('secret-pw');

    clearPdfPasswordForDocumentKey('doc-123');
    expect(getPdfPasswordForDocumentKey('sha256:doc-123')).toBeUndefined();
  });

  it('classifies PDF.js PasswordException need-password and incorrect-password errors', () => {
    expect(classifyPdfPasswordError({ name: 'PasswordException', code: 1, message: 'No password given' }))
      .toBe('need-password');
    expect(classifyPdfPasswordError({ name: 'PasswordException', code: 2, message: 'Incorrect Password' }))
      .toBe('incorrect-password');
    expect(classifyPdfPasswordError(new Error('Incorrect Password'))).toBe('incorrect-password');
    expect(classifyPdfPasswordError(new Error('Random corrupt stream'))).toBeNull();
  });
});
