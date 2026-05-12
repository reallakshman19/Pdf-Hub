import { describe, expect, it } from 'vitest';
import {
  clampPdfPointToPage,
  clampPdfRectToPage,
  getViewportSize,
  pdfRectToViewportRect,
  pdfToViewportPoint,
  screenToPdfPoint,
  viewportRectToPdfRect,
  viewportToPdfPoint,
} from './coordinateTransform';
import type {
  PdfPoint,
  PdfRect,
  WriterPageViewport,
  WriterRotation,
} from './types';

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const EPSILON_PT = 0.5;

function expectPointClose(actual: PdfPoint, expected: PdfPoint): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(EPSILON_PT);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(EPSILON_PT);
}

function expectRectClose(actual: PdfRect, expected: PdfRect): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(EPSILON_PT);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(EPSILON_PT);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(EPSILON_PT);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(EPSILON_PT);
}

function viewport(scale: number, rotation: WriterRotation): WriterPageViewport {
  return {
    pdfWidth: PDF_WIDTH,
    pdfHeight: PDF_HEIGHT,
    scale,
    rotation,
  };
}

describe('writer-v2 coordinateTransform', () => {
  it.each([0.5, 1, 2, 4])(
    'roundtrips PDF point at zoom scale %s',
    (scale) => {
      const input = { x: 123.25, y: 456.75 };

      for (const rotation of [0, 90, 180, 270] as WriterRotation[]) {
        const next = viewportToPdfPoint(
          pdfToViewportPoint(input, viewport(scale, rotation)),
          viewport(scale, rotation),
        );

        expectPointClose(next, input);
      }
    },
  );

  it.each([0, 90, 180, 270] as WriterRotation[])(
    'roundtrips PDF rect at rotation %s',
    (rotation) => {
      const input = {
        x: 100,
        y: 140,
        width: 220,
        height: 90,
      };

      for (const scale of [0.5, 1, 2, 4]) {
        const next = viewportRectToPdfRect(
          pdfRectToViewportRect(input, viewport(scale, rotation)),
          viewport(scale, rotation),
        );

        expectRectClose(next, input);
      }
    },
  );

  it('computes rotated viewport sizes', () => {
    expect(getViewportSize(viewport(1, 0))).toEqual({
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
    });

    expect(getViewportSize(viewport(2, 90))).toEqual({
      width: PDF_HEIGHT * 2,
      height: PDF_WIDTH * 2,
    });

    expect(getViewportSize(viewport(0.5, 270))).toEqual({
      width: PDF_HEIGHT * 0.5,
      height: PDF_WIDTH * 0.5,
    });
  });

  it('handles screen point conversion independent of scroll position', () => {
    const pageElement = {
      getBoundingClientRect: () => ({
        left: 80,
        top: 125,
        right: 80 + PDF_WIDTH,
        bottom: 125 + PDF_HEIGHT,
        width: PDF_WIDTH,
        height: PDF_HEIGHT,
        x: 80,
        y: 125,
        toJSON: () => ({}),
      }),
    } as Pick<HTMLElement, 'getBoundingClientRect'>;

    const pdf = screenToPdfPoint(
      {
        clientX: 180,
        clientY: 225,
      },
      pageElement,
      viewport(1, 0),
    );

    expectPointClose(pdf, {
      x: 100,
      y: PDF_HEIGHT - 100,
    });
  });

  it.each([1, 1.5, 2])(
    'roundtrip remains stable under devicePixelRatio %s because CSS coordinates are used',
    (devicePixelRatio) => {
      const scale = 1.25;
      const input = {
        x: 88 * devicePixelRatio,
        y: 155,
      };

      const result = viewportToPdfPoint(
        pdfToViewportPoint(input, viewport(scale, 0)),
        viewport(scale, 0),
      );

      expectPointClose(result, input);
    },
  );

  it('clamps PDF points and rectangles to page bounds', () => {
    expect(clampPdfPointToPage({ x: -10, y: 999 }, viewport(1, 0))).toEqual({
      x: 0,
      y: PDF_HEIGHT,
    });

    expect(clampPdfRectToPage(
      {
        x: -50,
        y: -40,
        width: 900,
        height: 900,
      },
      viewport(1, 0),
    )).toEqual({
      x: 0,
      y: 0,
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
    });
  });

  it('rejects invalid viewport inputs', () => {
    expect(() =>
      pdfToViewportPoint(
        { x: 1, y: 1 },
        {
          pdfWidth: 0,
          pdfHeight: PDF_HEIGHT,
          scale: 1,
          rotation: 0,
        },
      ),
    ).toThrow(/pdfWidth/);

    expect(() =>
      pdfToViewportPoint(
        { x: 1, y: 1 },
        {
          pdfWidth: PDF_WIDTH,
          pdfHeight: PDF_HEIGHT,
          scale: 0,
          rotation: 0,
        },
      ),
    ).toThrow(/scale/);
  });
});
