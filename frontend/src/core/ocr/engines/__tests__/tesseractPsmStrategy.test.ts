import { describe, expect, it } from 'vitest';
import {
  determineFallbackPsm,
  determinePrimaryPsm,
  selectBestRecognitionPass,
  shouldTriggerMultiPass,
  TESSERACT_PSM,
} from '../tesseractPsmStrategy';

describe('tesseractPsmStrategy', () => {
  it('determines PSM 3 for full document page by default', () => {
    const psm = determinePrimaryPsm({
      width: 595,
      height: 842,
      isRegionCrop: false,
    });
    expect(psm).toBe(TESSERACT_PSM.AUTO); // '3'
  });

  it('determines PSM 11 for engineering/cad profile', () => {
    const psm = determinePrimaryPsm({
      width: 1000,
      height: 800,
      profileId: 'engineering-cad',
    });
    expect(psm).toBe(TESSERACT_PSM.SPARSE_TEXT); // '11'
  });

  it('determines PSM 7 for wide single-line region crop', () => {
    const psm = determinePrimaryPsm({
      width: 200,
      height: 25,
      isRegionCrop: true,
    });
    expect(psm).toBe(TESSERACT_PSM.SINGLE_LINE); // '7'
  });

  it('determines PSM 8 for small single-word region crop', () => {
    const psm = determinePrimaryPsm({
      width: 60,
      height: 20,
      isRegionCrop: true,
    });
    expect(psm).toBe(TESSERACT_PSM.SINGLE_WORD); // '8'
  });

  it('determines PSM 3 for standard block region crop', () => {
    const psm = determinePrimaryPsm({
      width: 200,
      height: 150,
      isRegionCrop: true,
    });
    expect(psm).toBe(TESSERACT_PSM.AUTO); // '3'
  });

  it('honors user preferred PSM override', () => {
    const psm = determinePrimaryPsm({
      width: 200,
      height: 25,
      userPreferredPsm: '4',
    });
    expect(psm).toBe('4');
  });

  it('triggers multi-pass when words count is zero or confidence is low', () => {
    expect(
      shouldTriggerMultiPass({
        wordsCount: 0,
        averageConfidence: 0,
        primaryPsm: '3',
        multiPassEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldTriggerMultiPass({
        wordsCount: 5,
        averageConfidence: 35,
        primaryPsm: '3',
        multiPassEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldTriggerMultiPass({
        wordsCount: 5,
        averageConfidence: 85,
        primaryPsm: '3',
        multiPassEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldTriggerMultiPass({
        wordsCount: 0,
        averageConfidence: 0,
        primaryPsm: '3',
        multiPassEnabled: false,
      }),
    ).toBe(false);
  });

  it('determines appropriate fallback PSM', () => {
    expect(determineFallbackPsm(TESSERACT_PSM.AUTO, false)).toBe(TESSERACT_PSM.SPARSE_TEXT);
    expect(determineFallbackPsm(TESSERACT_PSM.SPARSE_TEXT, false)).toBe(TESSERACT_PSM.AUTO);
    expect(determineFallbackPsm(TESSERACT_PSM.SINGLE_LINE, true)).toBe(TESSERACT_PSM.AUTO);
    expect(determineFallbackPsm(TESSERACT_PSM.AUTO, true)).toBe(TESSERACT_PSM.SINGLE_BLOCK);
  });

  it('selects best recognition pass', () => {
    // Zero words vs non-zero words
    expect(
      selectBestRecognitionPass(
        { wordsCount: 0, averageConfidence: 0 },
        { wordsCount: 3, averageConfidence: 60 },
      ),
    ).toBe('B');

    // Higher composite score
    expect(
      selectBestRecognitionPass(
        { wordsCount: 5, averageConfidence: 50 },
        { wordsCount: 8, averageConfidence: 75 },
      ),
    ).toBe('B');

    expect(
      selectBestRecognitionPass(
        { wordsCount: 10, averageConfidence: 90 },
        { wordsCount: 2, averageConfidence: 40 },
      ),
    ).toBe('A');
  });
});
