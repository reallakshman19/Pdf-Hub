import { afterEach, describe, expect, it, vi } from 'vitest';
import { KonvaAdapter, toLocalAnnotationPoints } from './KonvaAdapter';
import type { AnnotationType, PdfAnnotation } from '@/core/annotations/types';

function stubCanvas2d(): void {
  const ctxMock = new Proxy(
    {
      canvas: { width: 500, height: 400 },
      measureText: () => ({ width: 20 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => ({}),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        return () => {};
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctxMock as unknown as RenderingContext,
  );
}

function makeAnn(type: AnnotationType, extraData: Record<string, unknown> = {}): PdfAnnotation {
  return {
    id: `ann-${type}`,
    type,
    pageNumber: 1,
    rect: { x: 10, y: 20, width: 100, height: 40 },
    data: { borderColor: '#ef4444', backgroundColor: '#ffffff', ...extraData },
    createdAt: 100,
    updatedAt: 100,
  };
}

describe('adapters/annotation-canvas/KonvaAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts local annotation points across page, rect-local, and auto spaces', () => {
    expect(toLocalAnnotationPoints([1, 2, 3, 4], 10, 20, 100, 50, 'rect-local')).toEqual([1, 2, 3, 4]);
    expect(toLocalAnnotationPoints([15, 30, 25, 40], 10, 20, 100, 50, 'page')).toEqual([5, 10, 15, 20]);
    expect(toLocalAnnotationPoints([5, 10, 25, 30], 10, 20, 100, 50)).toEqual([5, 10, 25, 30]);
    expect(toLocalAnnotationPoints([150, 200, 200, 250], 10, 20, 100, 50)).toEqual([140, 180, 190, 230]);
  });

  it('guards when uninitialized, renders all annotation types on a stage, serializes, deserializes, and removes', () => {
    stubCanvas2d();
    const adapter = new KonvaAdapter();
    expect(adapter.addObject(makeAnn('shape-rect'))).toBeNull();
    expect(adapter.serialize(1)).toEqual([]);
    adapter.removeObject('missing');
    adapter.deserialize([]);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const stage = adapter.initStage(host, 500, 400);
    expect(stage).toBeTruthy();
    expect(host.style.touchAction).toBe('none');

    const types: AnnotationType[] = [
      'textbox',
      'highlight',
      'underline',
      'strikeout',
      'squiggly',
      'shape-rect',
      'shape-ellipse',
      'shape-polygon',
      'area-takeoff',
      'perimeter-takeoff',
      'shape-cloud',
      'ink',
      'line',
      'arrow',
      'callout',
      'sticky-note',
      'stamp',
      'comment',
      'redaction',
    ];

    for (const type of types) {
      const node = adapter.addObject(
        makeAnn(type, {
          text: 'Test',
          points: [10, 20, 50, 30, 80, 50],
          isCollapsed: type === 'sticky-note',
        }),
      );
      expect(node).toBeTruthy();
    }

    // Expanded sticky-note & ink paths array & unknown fallback
    expect(adapter.addObject(makeAnn('sticky-note', { isCollapsed: false }))).toBeTruthy();
    expect(adapter.addObject(makeAnn('ink', { paths: [[15, 25, 45, 35]] }))).toBeTruthy();
    expect(adapter.addObject({ ...makeAnn('textbox'), id: 'ann-unknown', type: 'unknown-x' as AnnotationType })).toBeTruthy();

    const serialized = adapter.serialize(1);
    expect(serialized.length).toBe(types.length + 3);

    adapter.removeObject('ann-textbox');
    expect(adapter.serialize(1).some((a) => a.id === 'ann-textbox')).toBe(false);

    adapter.deserialize([makeAnn('textbox'), makeAnn('shape-rect')]);
    expect(adapter.serialize(2)).toHaveLength(2);

    stage.destroy();
    host.remove();
  });
});
