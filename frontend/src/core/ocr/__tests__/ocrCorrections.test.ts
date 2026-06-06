import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { buildOcrSearchIndex, searchOcrIndex } from '../ocrSearchIndex';
import {
  applyOcrCorrectionText,
  applyOcrCorrectionsToDocument,
  createOcrCorrection,
  createOcrCorrectionState,
  deleteOcrCorrectionForTarget,
  getOcrCorrectionForTarget,
  ocrCorrectionReducer,
  upsertOcrCorrection,
  validateOcrCorrection,
} from '../ocrCorrections';

describe('ocrCorrections', () => {
  it('creates and validates OCR correction', () => {
    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(correction.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(correction.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(correction.correctedText).toBe('Pipe');

    const validation = validateOcrCorrection(correction, {
      pageIndex: 0,
      width: 100,
      height: 100,
    });

    expect(validation.valid).toBe(true);
    expect(validation.diagnostics).toHaveLength(0);
  });

  it('rejects correction bbox outside page', () => {
    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'Bad',
      correctedText: 'Good',
      bbox: {
        x: 90,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const validation = validateOcrCorrection(correction, {
      pageIndex: 0,
      width: 100,
      height: 100,
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.some((item) => item.code === 'OUT_OF_PAGE_BBOX')).toBe(true);
  });

  it('upserts correction by target and preserves original id/createdAt', () => {
    const first = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const second = createOcrCorrection({
      id: 'correction-2',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'PIPE',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-02T00:00:00.000Z',
    });

    const corrections = upsertOcrCorrection([first], second);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.id).toBe('correction-1');
    expect(corrections[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(corrections[0]!.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(corrections[0]!.correctedText).toBe('PIPE');
  });

  it('gets and deletes correction by target', () => {
    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(
      getOcrCorrectionForTarget([correction], {
        documentFingerprint: 'doc-1',
        pageIndex: 0,
        targetId: 'word-1',
      })?.correctedText,
    ).toBe('Pipe');

    const afterDelete = deleteOcrCorrectionForTarget([correction], {
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
    });

    expect(afterDelete).toHaveLength(0);
  });

  it('supports pure correction reducer actions', () => {
    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const initial = createOcrCorrectionState();

    const inserted = ocrCorrectionReducer(initial, {
      type: 'UPSERT_OCR_CORRECTION',
      correction,
    });

    expect(inserted.corrections).toHaveLength(1);

    const deleted = ocrCorrectionReducer(inserted, {
      type: 'DELETE_OCR_CORRECTION',
      correctionId: 'correction-1',
    });

    expect(deleted.corrections).toHaveLength(0);
  });

  it('applies correction text helper', () => {
    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: {
        x: 10,
        y: 20,
        width: 40,
        height: 12,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(applyOcrCorrectionText('P1pe', correction)).toBe('Pipe');
    expect(applyOcrCorrectionText('P1pe', null)).toBe('P1pe');
  });

  it('applies corrections to derived OCR document without mutating raw document', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-correct-derived',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const targetWord = document.pages[0]!.words!.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock OCR word P1pe.');
    }

    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: document.documentFingerprint,
      pageIndex: 0,
      targetId: targetWord.id,
      targetType: 'word',
      originalText: targetWord.text,
      correctedText: 'Pipe',
      bbox: targetWord.bbox,
      now: '2026-01-01T00:00:00.000Z',
    });

    const corrected = applyOcrCorrectionsToDocument(document, [correction]);

    expect(document.pages[0]!.words!.find((word) => word.id === targetWord.id)?.text).toBe('P1pe');
    expect(corrected.pages[0]!.words!.find((word) => word.id === targetWord.id)?.text).toBe('Pipe');
    expect(corrected.pages[0]!.words!.find((word) => word.id === targetWord.id)?.normalizedText).toBe('pipe');
    expect(corrected.diagnostics.some((item) => item.code === 'CORRECTION_APPLIED')).toBe(true);
  });

  it('feeds corrections into OCR search index', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-correction-search',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const targetWord = document.pages[0]!.words!.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock OCR word P1pe.');
    }

    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: document.documentFingerprint,
      pageIndex: 0,
      targetId: targetWord.id,
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: targetWord.bbox,
      now: '2026-01-01T00:00:00.000Z',
    });

    const index = buildOcrSearchIndex({
      document,
      corrections: [correction],
    });

    const matches = searchOcrIndex(index, {
      text: 'pipe',
      source: 'ocrCorrection',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.item.text === 'Pipe')).toBe(true);
  });
});
