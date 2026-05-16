import type {
  PdfPoint,
  PdfRect,
  WriterElementV2,
} from './types';
import type { WriterV2Tool } from './writerV2Store';
import {
  createRichTextBoxElement,
  createTextCalloutElement,
} from './writerElementFactory';

export interface WriterPlacementInput {
  tool: WriterV2Tool;
  documentFingerprint: string;
  pageIndex: number;
  clickPoint: PdfPoint;
  pageBounds: PdfRect;
  zIndex?: number;
}

const DEFAULT_BOX_WIDTH = 220;
const DEFAULT_BOX_HEIGHT = 90;
const CALLOUT_OFFSET_X = 48;
const CALLOUT_OFFSET_Y = 28;

export function createWriterElementFromPlacement(
  input: WriterPlacementInput,
): WriterElementV2 | null {
  if (input.tool === 'select') return null;

  if (input.tool === 'richTextBox') {
    return createRichTextBoxElement({
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      rect: placeRectAtTopLeft(
        input.clickPoint,
        input.pageBounds,
        DEFAULT_BOX_WIDTH,
        DEFAULT_BOX_HEIGHT,
      ),
      text: 'Double-click to edit',
      zIndex: input.zIndex,
    });
  }

  if (input.tool === 'textCallout') {
    return createTextCalloutElement({
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      rect: placeRectNearAnchor(
        input.clickPoint,
        input.pageBounds,
        DEFAULT_BOX_WIDTH,
        DEFAULT_BOX_HEIGHT,
      ),
      anchorPoint: input.clickPoint,
      text: 'Callout note',
      zIndex: input.zIndex,
    });
  }

  return null;
}

function placeRectAtTopLeft(
  point: PdfPoint,
  bounds: PdfRect,
  width: number,
  height: number,
): PdfRect {
  return clampRectToBounds(
    {
      x: point.x,
      y: point.y - height,
      width,
      height,
    },
    bounds,
  );
}

function placeRectNearAnchor(
  anchor: PdfPoint,
  bounds: PdfRect,
  width: number,
  height: number,
): PdfRect {
  return clampRectToBounds(
    {
      x: anchor.x + CALLOUT_OFFSET_X,
      y: anchor.y + CALLOUT_OFFSET_Y,
      width,
      height,
    },
    bounds,
  );
}

function clampRectToBounds(rect: PdfRect, bounds: PdfRect): PdfRect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);

  return {
    x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}