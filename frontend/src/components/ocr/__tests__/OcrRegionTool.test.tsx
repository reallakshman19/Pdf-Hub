import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import {
  normalizePdfRectFromPoints,
  OcrRegionTool,
  pdfRectToViewportRect,
  viewportPointToPdfPoint,
} from '../OcrRegionTool';

describe('OcrRegionTool', () => {
  it('converts viewport point to PDF point', () => {
    const point = viewportPointToPdfPoint({
      point: {
        x: 100,
        y: 50,
      },
      pageWidth: 500,
      pageHeight: 1000,
      viewportWidth: 250,
      viewportHeight: 500,
    });

    expect(point.x).toBe(200);
    expect(point.y).toBe(900);
  });

  it('converts PDF rect to viewport rect', () => {
    const rect = pdfRectToViewportRect({
      rect: {
        x: 100,
        y: 200,
        width: 50,
        height: 20,
      },
      pageWidth: 500,
      pageHeight: 1000,
      viewportWidth: 250,
      viewportHeight: 500,
    });

    expect(rect.left).toBe(50);
    expect(rect.top).toBe(390);
    expect(rect.width).toBe(25);
    expect(rect.height).toBe(10);
  });

  it('normalizes PDF rect from two points', () => {
    const rect = normalizePdfRectFromPoints(
      {
        x: 200,
        y: 100,
      },
      {
        x: 100,
        y: 300,
      },
    );

    expect(rect).toEqual({
      x: 100,
      y: 100,
      width: 100,
      height: 200,
    });
  });

  it('renders region tool and creates region from manual values', () => {
    let created: OcrRegion | null = null;

    render(
      <OcrRegionTool
        documentFingerprint="doc-region-tool"
        pageIndex={0}
        pageWidth={595}
        pageHeight={842}
        viewportWidth={240}
        viewportHeight={340}
        onCreateRegion={(region) => {
          created = region;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-mode'), {
      target: {
        value: 'table',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-x'), {
      target: {
        value: '50',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-y'), {
      target: {
        value: '60',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-width'), {
      target: {
        value: '200',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-height'), {
      target: {
        value: '100',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));

    expect(created).not.toBeNull();
    const regionObj = created as unknown as OcrRegion;
    expect(regionObj.documentFingerprint).toBe('doc-region-tool');
    expect(regionObj.mode).toBe('table');
    expect(regionObj.bbox).toMatchObject({
      x: 50,
      y: 60,
      width: 200,
      height: 100,
    });
  });

  it('shows validation error for out-of-page region', () => {
    render(
      <OcrRegionTool
        documentFingerprint="doc-region-tool"
        pageIndex={0}
        pageWidth={595}
        pageHeight={842}
        viewportWidth={240}
        viewportHeight={340}
        onCreateRegion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-x'), {
      target: {
        value: '590',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-region-width'), {
      target: {
        value: '100',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-add'));

    expect(screen.getByTestId('ocr-region-error')).toBeTruthy();
    expect(screen.getByText('OCR region bbox is outside page bounds.')).toBeTruthy();
  });

  it('supports pointer drag to create draft region', () => {
    render(
      <OcrRegionTool
        documentFingerprint="doc-region-tool"
        pageIndex={0}
        pageWidth={595}
        pageHeight={842}
        viewportWidth={240}
        viewportHeight={340}
        onCreateRegion={() => undefined}
      />,
    );

    const canvas = screen.getByTestId('ocr-region-canvas');

    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 240,
      bottom: 340,
      width: 240,
      height: 340,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, {
      clientX: 40,
      clientY: 60,
    });

    fireEvent.pointerMove(canvas, {
      clientX: 140,
      clientY: 160,
    });

    fireEvent.pointerUp(canvas);

    expect(Number((screen.getByTestId('ocr-region-width') as HTMLInputElement).value)).toBeGreaterThan(0);
    expect(Number((screen.getByTestId('ocr-region-height') as HTMLInputElement).value)).toBeGreaterThan(0);
  });

  it('resets draft region', () => {
    render(
      <OcrRegionTool
        documentFingerprint="doc-region-tool"
        pageIndex={0}
        pageWidth={595}
        pageHeight={842}
        viewportWidth={240}
        viewportHeight={340}
        onCreateRegion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-region-x'), {
      target: {
        value: '123',
      },
    });

    expect(screen.getByTestId('ocr-region-x')).toHaveValue(123);

    fireEvent.click(screen.getByTestId('ocr-region-reset'));

    expect(screen.getByTestId('ocr-region-x')).toHaveValue(72);
  });
});
