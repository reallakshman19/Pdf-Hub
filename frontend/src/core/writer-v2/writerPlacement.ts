import type {
  PdfPoint,
  PdfRect,
  WriterElementV2,
} from './types';
import type { WriterV2Tool } from './writerV2Store';
import {
  createRichTextBoxElement,
  createTextCalloutElement,
  createReviewLabelElement,
  createTextStampElement,
  createRichNoteElement,
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
const STAMP_WIDTH = 180;
const STAMP_HEIGHT = 50;
const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 110;
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

  if (input.tool === 'textStamp') {
    return createTextStampElement({
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      rect: placeRectAtTopLeft(
        input.clickPoint,
        input.pageBounds,
        STAMP_WIDTH,
        STAMP_HEIGHT,
      ),
      text: 'DRAFT',
      zIndex: input.zIndex,
    });
  }

  if (input.tool === 'reviewLabel') {
    return createReviewLabelElement({
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      rect: placeRectAtTopLeft(
        input.clickPoint,
        input.pageBounds,
        DEFAULT_BOX_WIDTH,
        DEFAULT_BOX_HEIGHT,
      ),
      text: 'Review comment',
      zIndex: input.zIndex,
    });
  }

  if (input.tool === 'richNote') {
    return createRichNoteElement({
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      rect: placeRectAtTopLeft(
        input.clickPoint,
        input.pageBounds,
        NOTE_WIDTH,
        NOTE_HEIGHT,
      ),
      text: 'Note',
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