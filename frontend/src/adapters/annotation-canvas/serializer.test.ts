import { describe, expect, it } from 'vitest';
import {
  deserializeKonvaNodeToAnnotation,
  serializeAnnotationToKonvaConfig,
} from './serializer';
import type { PdfAnnotation } from '@/core/annotations/types';

describe('adapters/annotation-canvas/serializer', () => {
  it('deserializes Konva Text, Line, highlight Rect, and default Rect shapes', () => {
    expect(deserializeKonvaNodeToAnnotation({ text: 'Note', x: 10, y: 20, width: 80, height: 30 }, 'Text')).toMatchObject({
      type: 'textbox',
      rect: { x: 10, y: 20, width: 80, height: 30 },
    });
    expect(deserializeKonvaNodeToAnnotation({}, 'Line')).toMatchObject({
      type: 'ink',
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(deserializeKonvaNodeToAnnotation({ name: 'highlight', x: 5, y: 5 }, 'Rect')).toMatchObject({
      type: 'highlight',
      rect: { x: 5, y: 5, width: 100, height: 100 },
    });
    expect(deserializeKonvaNodeToAnnotation({ x: 1, y: 2, width: 3, height: 4 }, 'Rect')).toMatchObject({
      type: 'shape-rect',
      rect: { x: 1, y: 2, width: 3, height: 4 },
    });
  });

  it('serializes domain PdfAnnotation into Konva node config', () => {
    const ann: PdfAnnotation = {
      id: 'a-1',
      type: 'shape-rect',
      pageNumber: 1,
      rect: { x: 12, y: 24, width: 120, height: 60 },
      data: { stroke: '#ef4444', strokeWidth: 2 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    expect(serializeAnnotationToKonvaConfig(ann)).toEqual({
      stroke: '#ef4444',
      strokeWidth: 2,
      id: 'a-1',
      name: 'shape-rect',
      x: 12,
      y: 24,
      width: 120,
      height: 60,
    });
  });
});
