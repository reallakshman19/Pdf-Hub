import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterDocumentMetaV2, WriterElementV2 } from '../types';
import {
  normalizeWriterGeometryRect,
  updateActiveWriterElementGeometry,
} from '../writerGeometryActions';
import { useWriterV2Store } from '../writerV2Store';

describe('writerGeometryActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('normalizes invalid geometry values', () => {
    expect(normalizeWriterGeometryRect({
      x: Number.NaN,
      y: -10,
      width: 0,
      height: 4,
    })).toEqual({
      x: 0,
      y: 0,
      width: 12,
      height: 12,
    });
  });

  it('clamps geometry to blank document page bounds', () => {
    expect(normalizeWriterGeometryRect(
      { x: 590, y: 795, width: 40, height: 30 },
      { width: 600, height: 800 },
    )).toEqual({
      x: 560,
      y: 770,
      width: 40,
      height: 30,
    });
  });

  it('updates selected Writer element geometry', () => {
    hydrateSelection([makeElement()], ['box-1']);

    const result = updateActiveWriterElementGeometry({
      x: 72,
      y: 120,
      width: 220,
      height: 96,
    });

    const updated = useWriterV2Store.getState().elements[0];

    expect(result.changed).toBe(true);
    expect(updated.rect).toEqual({
      x: 72,
      y: 120,
      width: 220,
      height: 96,
    });
    expect(useWriterV2Store.getState().dirty).toBe(true);
  });

  it('rejects geometry update when selection is not exactly one element', () => {
    hydrateSelection([makeElement(), makeElement('box-2')], ['box-1', 'box-2']);

    const result = updateActiveWriterElementGeometry({ x: 72 });

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/exactly one/i);
  });
});

function hydrateSelection(elements: WriterElementV2[], selectedIds: string[]): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'geometry-doc',
    elements,
    documentMeta: makeBlankMeta(),
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_WRITER_SELECTION',
    ids: selectedIds,
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_ACTIVE_WRITER_ELEMENT',
    id: selectedIds.at(-1) ?? null,
  });
}

function makeBlankMeta(): WriterDocumentMetaV2 {
  return {
    documentFingerprint: 'geometry-doc',
    mode: 'blankDocument',
    title: 'Geometry Document',
    pageSetup: {
      preset: 'Custom',
      width: 600,
      height: 800,
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
      backgroundColor: '#ffffff',
    },
    pageCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeElement(id = 'box-1'): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'geometry-doc',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 50,
      width: 100,
      height: 40,
    },
    plainText: id,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      fontSize: 12,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
