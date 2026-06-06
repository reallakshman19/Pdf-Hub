import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../../writer-v2/types';
import { useWriterV2Store } from '../../writer-v2/writerV2Store';
import {
  createOcrWriterBatchInsertCommand,
  createOcrWriterBridgeDiagnosticsSummary,
  insertOcrWriterElementsIntoWriterV2Store,
  insertOcrWriterQueueIntoWriterV2Store,
  normalizeOcrWriterElementForInsertion,
} from '../ocrWriterBridge';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '../ocrWriterInsertion';

describe('ocrWriterBridge', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'writer-doc',
      elements: [],
      assetRecords: [],
      persistedAt: null,
    });
  });

  it('creates BATCH_ADD_WRITER_ELEMENTS command', () => {
    const elements = [makeTextElement()];

    const command = createOcrWriterBatchInsertCommand(elements, {
      selectAll: true,
    });

    expect(command.type).toBe('BATCH_ADD_WRITER_ELEMENTS');
    if (command.type === 'BATCH_ADD_WRITER_ELEMENTS') {
      expect(command.elements).toBe(elements);
      expect(command.selectAll).toBe(true);
    } else {
      expect.fail('Command should be BATCH_ADD_WRITER_ELEMENTS');
    }
  });

  it('normalizes document fingerprint and updatedAt', () => {
    const normalized = normalizeOcrWriterElementForInsertion(makeTextElement(), {
      documentFingerprint: 'normalized-doc',
      now: '2026-02-01T00:00:00.000Z',
    });

    expect(normalized.documentFingerprint).toBe('normalized-doc');
    expect(normalized.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('inserts OCR Writer elements into Writer V2 store', () => {
    const result = insertOcrWriterElementsIntoWriterV2Store({
      elements: [makeTextElement()],
      documentFingerprint: 'writer-doc',
      selectAll: true,
      now: '2026-02-01T00:00:00.000Z',
    });

    const writerState = useWriterV2Store.getState();

    expect(result.commandApplied).toBe(true);
    expect(result.insertedElements).toHaveLength(1);
    expect(writerState.elements).toHaveLength(1);
    expect(writerState.elements[0].id).toBe('ocr-text-1');
    expect(writerState.elements[0].documentFingerprint).toBe('writer-doc');
    expect(writerState.elements[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(writerState.selectedIds).toEqual(['ocr-text-1']);
    expect(writerState.activeId).toBe('ocr-text-1');
    expect(writerState.dirty).toBe(true);
  });

  it('inserts queue into Writer V2 store', () => {
    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement({
          id: 'ocr-text-queue',
        }),
      }),
    ]);

    const result = insertOcrWriterQueueIntoWriterV2Store({
      queue,
      documentFingerprint: 'writer-doc',
    });

    const writerState = useWriterV2Store.getState();

    expect(result.commandApplied).toBe(true);
    expect(writerState.elements).toHaveLength(1);
    expect(writerState.elements[0].id).toBe('ocr-text-queue');
  });

  it('rejects invalid elements and does not apply command', () => {
    const result = insertOcrWriterElementsIntoWriterV2Store({
      elements: [
        {
          ...makeTextElement(),
          id: 'bad',
          rect: {
            x: 0,
            y: 0,
            width: 0,
            height: 20,
          },
        },
      ],
      documentFingerprint: 'writer-doc',
    });

    const writerState = useWriterV2Store.getState();

    expect(result.commandApplied).toBe(false);
    expect(result.command).toBeNull();
    expect(result.insertedElements).toHaveLength(0);
    expect(result.rejectedElements).toHaveLength(1);
    expect(writerState.elements).toHaveLength(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'INVALID_RECT')).toBe(true);
  });

  it('uses Writer store currentDocumentFingerprint when not supplied', () => {
    const result = insertOcrWriterElementsIntoWriterV2Store({
      elements: [
        {
          ...makeTextElement(),
          documentFingerprint: 'ocr-doc',
        },
      ],
      selectAll: true,
    });

    const writerState = useWriterV2Store.getState();

    expect(result.commandApplied).toBe(true);
    expect(writerState.elements[0].documentFingerprint).toBe('writer-doc');
  });

  it('builds diagnostics summary', () => {
    const summary = createOcrWriterBridgeDiagnosticsSummary([
      {
        level: 'info',
        code: 'VALID_WRITER_ELEMENT',
        message: 'ok',
      },
      {
        level: 'warning',
        code: 'EMPTY_WRITER_TEXT',
        message: 'warning',
      },
      {
        level: 'error',
        code: 'INVALID_RECT',
        message: 'error',
      },
    ]);

    expect(summary).toEqual({
      infos: 1,
      warnings: 1,
      errors: 1,
    });
  });
});

function makeTextElement(
  patch: {
    id?: string;
  } = {},
): WriterElementV2 {
  return {
    id: patch.id ?? 'ocr-text-1',
    documentFingerprint: 'ocr-doc',
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
