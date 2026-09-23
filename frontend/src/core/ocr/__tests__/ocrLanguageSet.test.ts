import { describe, expect, it } from 'vitest';
import {
  OcrLanguageSetError,
  normalizeOcrLanguageSet,
  ocrLanguageSetsEqual,
  ocrLanguageSetToEngineSpec,
} from '../ocrLanguageSet';

describe('ocrLanguageSet', () => {
  it('normalizes legacy and array multilingual inputs without changing order', () => {
    expect(normalizeOcrLanguageSet('eng+hin, tam+eng')).toEqual([
      'eng',
      'hin',
      'tam',
    ]);

    expect(normalizeOcrLanguageSet(['eng', 'ara', 'eng', 'script/Latin'])).toEqual([
      'eng',
      'ara',
      'script/Latin',
    ]);
  });

  it('keeps the legacy English default when no languages are supplied', () => {
    expect(normalizeOcrLanguageSet(undefined)).toEqual(['eng']);
    expect(ocrLanguageSetToEngineSpec([])).toBe('eng');
  });

  it('creates the Tesseract-compatible ordered language spec', () => {
    expect(ocrLanguageSetToEngineSpec(['eng', 'hin', 'tam'])).toBe('eng+hin+tam');
  });

  it('compares language sets by canonical ordered semantics', () => {
    expect(ocrLanguageSetsEqual('eng+hin', ['eng', 'hin'])).toBe(true);
    expect(ocrLanguageSetsEqual('hin+eng', ['eng', 'hin'])).toBe(false);
  });

  it('rejects path traversal and malformed language identifiers', () => {
    expect(() => normalizeOcrLanguageSet('../eng')).toThrow(OcrLanguageSetError);
    expect(() => normalizeOcrLanguageSet('eng+$bad')).toThrow(OcrLanguageSetError);
  });
});
