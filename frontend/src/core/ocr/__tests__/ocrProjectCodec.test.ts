import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { WRITER_PROJECT_MEMBER_PROFILE_V1 } from '../../admission/zip/writerProjectMemberProfile';
import type { WriterElementV2 } from '../../writer-v2/types';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { createOcrCorrection } from '../ocrCorrections';
import { createOcrRegion } from '../ocrRegionModel';
import type { OcrResumeTokenV1 } from '../ocrResumeState';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '../ocrWriterInsertion';
import {
  createOcrProjectPayload,
  OCR_PROJECT_MANIFEST_PATH,
  readOcrProjectPayloadFromZip,
  validateOcrProjectPayload,
  writeOcrProjectPayloadToZip,
} from '../ocrProjectCodec';

describe('ocrProjectCodec', () => {
  it('creates valid OCR project payload', async () => {
    const result = await createMockOcrResult();

    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-ocr-project',
      result,
      corrections: [makeCorrection()],
      regions: [makeRegion()],
      writerInsertionQueue: createOcrWriterInsertionQueue([
        createOcrWriterInsertionCandidate({
          source: 'ocrRegion',
          element: makeWriterElement(),
        }),
      ]),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(payload.manifest.schema).toBe('pdf-hub-ocr-project');
    expect(payload.manifest.schemaVersion).toBe(1);
    expect(payload.manifest.documentFingerprint).toBe('doc-ocr-project');
    expect(payload.manifest.counts.pages).toBe(1);
    expect(payload.manifest.counts.corrections).toBe(1);
    expect(payload.manifest.counts.regions).toBe(1);
    expect(payload.manifest.counts.writerInsertionCandidates).toBe(1);

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(true);
  });

  it('normalizes nested document fingerprints', async () => {
    const result = await createMockOcrResult();

    const payload = createOcrProjectPayload({
      documentFingerprint: 'normalized-doc',
      result: {
        ...result,
        documentFingerprint: 'old-doc',
      },
      corrections: [
        {
          ...makeCorrection(),
          documentFingerprint: 'old-doc',
        },
      ],
      regions: [
        {
          ...makeRegion(),
          documentFingerprint: 'old-doc',
        },
      ],
      writerInsertionQueue: createOcrWriterInsertionQueue([
        createOcrWriterInsertionCandidate({
          source: 'ocrRegion',
          element: {
            ...makeWriterElement(),
            documentFingerprint: 'old-doc',
          },
        }),
      ]),
    });

    expect(payload.result?.documentFingerprint).toBe('normalized-doc');
    expect(payload.corrections[0].documentFingerprint).toBe('normalized-doc');
    expect(payload.regions[0].documentFingerprint).toBe('normalized-doc');
    expect(payload.writerInsertionQueue.candidates[0].element.documentFingerprint).toBe('normalized-doc');
  });

  it('writes and reads OCR payload from ZIP', async () => {
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-ocr-zip',
      result: await createMockOcrResult('doc-ocr-zip'),
      corrections: [
        makeCorrection('doc-ocr-zip'),
      ],
      regions: [
        makeRegion('doc-ocr-zip'),
      ],
      writerInsertionQueue: createOcrWriterInsertionQueue([
        createOcrWriterInsertionCandidate({
          source: 'ocrRegion',
          element: makeWriterElement('doc-ocr-zip'),
        }),
      ]),
      resumeToken: makeResumeToken('doc-ocr-zip'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const zip = new JSZip();

    await writeOcrProjectPayloadToZip(zip, payload);

    expect(zip.file(OCR_PROJECT_MANIFEST_PATH)).toBeTruthy();
    expect(zip.file('ocr/result.json')).toBeTruthy();
    expect(zip.file('ocr/corrections.json')).toBeTruthy();
    expect(zip.file('ocr/regions.json')).toBeTruthy();
    expect(zip.file('ocr/writer-insertion-queue.json')).toBeTruthy();
    expect(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name),
    ).toEqual(WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles);

    const bytes = await zip.generateAsync({
      type: 'uint8array',
    });

    const importedZip = await JSZip.loadAsync(bytes);
    const imported = await readOcrProjectPayloadFromZip(importedZip);

    expect(imported).not.toBeNull();
    expect(imported?.manifest.documentFingerprint).toBe('doc-ocr-zip');
    expect(imported?.result?.pages).toHaveLength(1);
    expect(imported?.corrections).toHaveLength(1);
    expect(imported?.regions).toHaveLength(1);
    expect(imported?.writerInsertionQueue.candidates).toHaveLength(1);
    expect(imported?.manifest.resumeToken).toMatchObject({
      schema: 'pdf-hub-ocr-resume',
      documentFingerprint: 'doc-ocr-zip',
      engineId: 'mock',
      profileId: 'clean-scan',
    });
  });

  it('rejects resume state bound to another document', () => {
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-a',
      resumeToken: makeResumeToken('doc-b'),
    });

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(false);
    expect(
      validation.diagnostics.some(
        (item) => item.code === 'MISMATCHED_DOCUMENT_FINGERPRINT',
      ),
    ).toBe(true);
  });

  it('rejects completed resume state when persisted OCR pages are absent', () => {
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-resume-no-result',
      resumeToken: makeResumeToken('doc-resume-no-result'),
    });

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(false);
    expect(
      validation.diagnostics.some(
        (item) =>
          item.code === 'INVALID_OCR_RESUME_TOKEN'
          && item.message.includes('no persisted OCR result'),
      ),
    ).toBe(true);
  });

  it('rejects persisted OCR result from another engine even when no batch is completed', async () => {
    const result = await createMockOcrResult('doc-resume-engine-mismatch');
    const token: OcrResumeTokenV1 = {
      ...makeResumeToken('doc-resume-engine-mismatch'),
      engineId: 'tesseract-js',
      tasks: [
        {
          id: 'ocr-batch-1',
          index: 0,
          pageIndexes: [0],
          status: 'failed',
          errorMessage: 'Retryable batch.',
        },
      ],
    };

    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-resume-engine-mismatch',
      result,
      resumeToken: token,
    });

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(false);
    expect(
      validation.diagnostics.some(
        (item) =>
          item.code === 'INVALID_OCR_RESUME_TOKEN'
          && item.message.includes('engine/profile'),
      ),
    ).toBe(true);
  });

  it('rejects completed checkpoints backed by failed persisted OCR pages', async () => {
    const result = await createMockOcrResult('doc-resume-failed-page');
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-resume-failed-page',
      result: {
        ...result,
        pages: result.pages.map((page) => ({
          ...page,
          status: 'failed' as const,
        })),
      },
      resumeToken: makeResumeToken('doc-resume-failed-page'),
    });

    const validation = validateOcrProjectPayload(payload);

    expect(validation.valid).toBe(false);
    expect(
      validation.diagnostics.some(
        (item) =>
          item.code === 'INVALID_OCR_RESUME_TOKEN'
          && item.message.includes('failed persisted page'),
      ),
    ).toBe(true);
  });

  it('returns null when ZIP has no OCR manifest', async () => {
    const zip = new JSZip();

    zip.file('manifest.json', JSON.stringify({ schema: 'pdf-hub-project' }));

    const payload = await readOcrProjectPayloadFromZip(zip);

    expect(payload).toBeNull();
  });

  it('rejects invalid OCR schema', () => {
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-invalid',
    });

    const invalid = {
      ...payload,
      manifest: {
        ...payload.manifest,
        schema: 'bad-schema' as 'pdf-hub-ocr-project',
      },
    };

    const validation = validateOcrProjectPayload(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.some((item) => item.code === 'INVALID_OCR_PROJECT_SCHEMA')).toBe(true);
  });
});

function makeResumeToken(
  documentFingerprint: string,
): OcrResumeTokenV1 {
  return {
    schema: 'pdf-hub-ocr-resume',
    schemaVersion: 1,
    documentFingerprint,
    engineId: 'mock',
    profileId: 'clean-scan',
    executionConfig: {
      forceOcr: false,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    tasks: [
      {
        id: 'ocr-batch-1',
        index: 0,
        pageIndexes: [0],
        status: 'completed',
      },
    ],
  };
}

async function createMockOcrResult(documentFingerprint = 'doc-ocr-project') {
  return mockOcrEngine.recognize({
    documentFingerprint,
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
}

function makeCorrection(documentFingerprint = 'doc-ocr-project') {
  return createOcrCorrection({
    id: 'correction-1',
    documentFingerprint,
    pageIndex: 0,
    targetId: 'word-1',
    targetType: 'word',
    originalText: 'P1pe',
    correctedText: 'Pipe',
    bbox: {
      x: 72,
      y: 680,
      width: 30,
      height: 14,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}

function makeRegion(documentFingerprint = 'doc-ocr-project') {
  return createOcrRegion({
    id: 'region-1',
    documentFingerprint,
    pageIndex: 0,
    mode: 'text',
    bbox: {
      x: 60,
      y: 620,
      width: 420,
      height: 180,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}

function makeWriterElement(documentFingerprint = 'doc-ocr-project'): WriterElementV2 {
  return {
    id: 'ocr-text-1',
    documentFingerprint,
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 220,
      height: 80,
    },
    plainText: 'OCR text',
    style: {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 4,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
