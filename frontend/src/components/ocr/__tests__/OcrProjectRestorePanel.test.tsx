import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { getOcrProfile } from '@/core/ocr/ocrProfiles';
import { mockOcrEngine } from '@/core/ocr/engines/mockOcrEngine';
import { createOcrProjectPayload } from '@/core/ocr/ocrProjectCodec';
import type { OcrResumeTokenV1 } from '@/core/ocr/ocrResumeState';
import { createOcrCorrection } from '@/core/ocr/ocrCorrections';
import { createOcrRegion } from '@/core/ocr/ocrRegionModel';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { OcrProjectRestorePanel } from '../OcrProjectRestorePanel';

describe('OcrProjectRestorePanel', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('renders empty state when no payload exists', () => {
    render(
      <OcrProjectRestorePanel payload={null} />,
    );

    expect(screen.getByTestId('ocr-project-restore-empty')).toBeTruthy();
    expect(screen.getByText('No OCR project data found in this project file.')).toBeTruthy();
  });

  it('renders OCR project summary', async () => {
    const payload = await makePayload('doc-restore-panel');

    render(
      <OcrProjectRestorePanel payload={payload} />,
    );

    expect(screen.getByTestId('ocr-project-restore-panel')).toBeTruthy();
    expect(screen.getByText('Restore OCR Project')).toBeTruthy();
    expect(screen.getByText('doc-restore-panel')).toBeTruthy();
    expect(screen.getByText('Writer queue')).toBeTruthy();
  });

  it('shows pending resumable OCR batches in the project summary', async () => {
    const base = await makePayload('doc-resume-summary');
    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-resume-summary',
      result: base.result,
      corrections: base.corrections,
      regions: base.regions,
      writerInsertionQueue: base.writerInsertionQueue,
      resumeToken: makeResumeToken('doc-resume-summary'),
    });

    render(
      <OcrProjectRestorePanel payload={payload} />,
    );

    expect(screen.getByText('OCR resume')).toBeTruthy();
    expect(screen.getByText('1 pending')).toBeTruthy();
  });

  it('restores OCR payload into store', async () => {
    const payload = await makePayload('doc-restore-panel');

    render(
      <OcrProjectRestorePanel
        payload={payload}
        expectedDocumentFingerprint="doc-restore-panel"
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-project-restore-button'));

    const state = useOcrStore.getState();

    expect(state.documentFingerprint).toBe('doc-restore-panel');
    expect(state.result?.pages).toHaveLength(1);
    expect(state.corrections).toHaveLength(1);
    expect(state.regions).toHaveLength(1);
    expect(state.searchIndex).not.toBeNull();
    expect(screen.getByTestId('ocr-project-restore-message')).toBeTruthy();
    expect(screen.getByText('OCR restored: 1 region(s), 1 correction(s).')).toBeTruthy();
  });

  it('warns and normalizes when active document fingerprint differs', async () => {
    const payload = await makePayload('old-doc');

    render(
      <OcrProjectRestorePanel
        payload={payload}
        expectedDocumentFingerprint="new-doc"
      />,
    );

    expect(screen.getByTestId('ocr-project-fingerprint-warning')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ocr-project-restore-button'));

    expect(useOcrStore.getState().documentFingerprint).toBe('new-doc');
    expect(useOcrStore.getState().result?.documentFingerprint).toBe('new-doc');
  });

  it('emits restored writer insertion queue callback', async () => {
    const payload = await makePayload('doc-queue');
    let restoredQueue: OcrWriterInsertionQueueState | null = null;

    render(
      <OcrProjectRestorePanel
        payload={payload}
        expectedDocumentFingerprint="doc-queue"
        onWriterInsertionQueueRestored={(queue) => {
          restoredQueue = queue;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-project-restore-button'));

    expect(restoredQueue).not.toBeNull();
    expect((restoredQueue as OcrWriterInsertionQueueState | null)?.candidates).toHaveLength(1);
  });
});

async function makePayload(documentFingerprint: string) {
  const result = await mockOcrEngine.recognize({
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

  return createOcrProjectPayload({
    documentFingerprint,
    result,
    corrections: [
      createOcrCorrection({
        id: 'correction-1',
        documentFingerprint,
        pageIndex: 0,
        targetId: result.pages[0].words![0].id,
        targetType: 'word',
        originalText: result.pages[0].words![0].text,
        correctedText: 'Corrected',
        bbox: result.pages[0].words![0].bbox,
        now: '2026-01-01T00:00:00.000Z',
      }),
    ],
    regions: [
      createOcrRegion({
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
      }),
    ],
    writerInsertionQueue: createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeWriterElement(documentFingerprint),
      }),
    ]),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
}

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
    createdAt: '2026-09-23T00:00:00.000Z',
    tasks: [
      {
        id: 'ocr-batch-1',
        index: 0,
        pageIndexes: [0],
        status: 'failed',
        errorMessage: 'Interrupted OCR batch.',
      },
    ],
  };
}

function makeWriterElement(documentFingerprint: string): WriterElementV2 {
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
