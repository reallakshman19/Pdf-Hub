import type { ActiveTool } from '@/core/editor/types';
import type { Rect } from '@/core/annotations/types';

/**
 * Text-mark annotations that apply directly to selected text.
 */
export const TEXT_MARK_TOOLS = [
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
] as const;

export type TextMarkTool = typeof TEXT_MARK_TOOLS[number];

/**
 * Note and callout tools that exhibit dual modality:
 * 1. Attaching to selected text when text is selected.
 * 2. Placing directly on the canvas at click coordinates on empty canvas.
 */
export const DUAL_MODALITY_NOTE_TOOLS = [
  'sticky-note',
  'comment',
  'callout',
] as const;

export type DualModalityNoteTool = typeof DUAL_MODALITY_NOTE_TOOLS[number];

/**
 * Canvas placement tools where clicks or drags create shapes/objects directly.
 */
export const CANVAS_PLACEMENT_TOOLS = [
  'textbox',
  'shape-rect',
  'shape-ellipse',
  'shape-polygon',
  'shape-cloud',
  'line',
  'arrow',
  'stamp',
  'redaction',
  'piping-support',
  'piping-valve',
  'perimeter-takeoff',
  'area-takeoff',
] as const;

export type CanvasPlacementTool = typeof CANVAS_PLACEMENT_TOOLS[number];

/**
 * Annotation types eligible for proportional dimension scaling during group resize.
 */
export const RESIZABLE_BOX_TYPES = [
  'textbox',
  'shape-rect',
  'shape-ellipse',
  'shape-cloud',
  'shape-polygon',
  'callout',
  'redaction',
] as const;

export function isSelectTool(tool: ActiveTool): boolean {
  return tool === 'select';
}

export function isHandTool(tool: ActiveTool): boolean {
  return tool === 'hand';
}

export function isTextMarkTool(tool: ActiveTool): tool is TextMarkTool {
  return (TEXT_MARK_TOOLS as readonly string[]).includes(tool);
}

export function isDualModalityNoteTool(tool: ActiveTool): tool is DualModalityNoteTool {
  return (DUAL_MODALITY_NOTE_TOOLS as readonly string[]).includes(tool);
}

export function isFreehandInkTool(tool: ActiveTool): boolean {
  return tool === 'ink';
}

export function isLineDrawTool(tool: ActiveTool): boolean {
  return tool === 'line' || tool === 'arrow';
}

export function isCanvasPlacementTool(tool: ActiveTool): tool is CanvasPlacementTool {
  return (CANVAS_PLACEMENT_TOOLS as readonly string[]).includes(tool);
}

/**
 * Whether the tool permits text selection across the PDF text layer.
 * True for select mode, text-mark tools, and dual-modality note tools.
 */
export function allowsTextSelection(tool: ActiveTool): boolean {
  if (tool === 'hand') return false;
  return tool === 'select' || isTextMarkTool(tool) || isDualModalityNoteTool(tool);
}

/**
 * Whether dragging across empty space draws a marquee selection box.
 * Strict contract: marquee is ONLY permitted in select mode.
 */
export function allowsMarquee(tool: ActiveTool): boolean {
  return tool === 'select';
}

/**
 * Whether pointer clicks on existing annotations select them.
 * Strict contract: object selection is active in select mode.
 */
export function allowsObjectSelection(tool: ActiveTool): boolean {
  return tool === 'select';
}

/**
 * Returns pointer-events styling for the PDF text/search interaction layer.
 */
export function getInteractionLayerPointerEvents(tool: ActiveTool): 'auto' | 'none' {
  if (tool === 'hand') return 'none';
  if (allowsTextSelection(tool) || tool === 'ink') return 'auto';
  return 'none';
}

/**
 * Returns pointer-events styling for the canvas placement and rubber-band layer.
 */
export function getPlacementLayerPointerEvents(tool: ActiveTool): 'auto' | 'none' {
  if (tool === 'hand') return 'none';
  if (isCanvasPlacementTool(tool) || isDualModalityNoteTool(tool) || tool === 'ink') {
    return 'auto';
  }
  return 'none';
}

/**
 * Returns CSS cursor class for the workspace surface given the active tool.
 */
export function getCanvasCursor(tool: ActiveTool, isDragging = false): string {
  if (tool === 'hand') {
    return isDragging ? 'cursor-grabbing' : 'cursor-grab';
  }
  if (isTextMarkTool(tool)) {
    return 'cursor-text';
  }
  if (isCanvasPlacementTool(tool) || isDualModalityNoteTool(tool) || tool === 'ink') {
    return 'cursor-crosshair';
  }
  return 'cursor-default';
}

/**
 * Calculates new rects for a group of annotations being resized together.
 * Proportional dimension scaling is applied to resizable box types, while
 * fixed-size items (e.g. sticky notes) translate relatively without distortion.
 */
export function calculateGroupResize(
  groupRect: Rect,
  items: Array<{ id: string; rect: Rect; type: string }>,
  dx: number,
  dy: number,
): Record<string, Rect> {
  if (groupRect.width <= 0 || groupRect.height <= 0 || items.length === 0) {
    const fallback: Record<string, Rect> = {};
    for (const item of items) fallback[item.id] = item.rect;
    return fallback;
  }

  const targetWidth = Math.max(16, groupRect.width + dx);
  const targetHeight = Math.max(16, groupRect.height + dy);
  const scaleX = targetWidth / groupRect.width;
  const scaleY = targetHeight / groupRect.height;

  const result: Record<string, Rect> = {};

  for (const item of items) {
    const relX = item.rect.x - groupRect.x;
    const relY = item.rect.y - groupRect.y;
    const nextX = groupRect.x + relX * scaleX;
    const nextY = groupRect.y + relY * scaleY;

    const isBox = (RESIZABLE_BOX_TYPES as readonly string[]).includes(item.type);

    result[item.id] = {
      x: Math.round(nextX * 100) / 100,
      y: Math.round(nextY * 100) / 100,
      width: isBox
        ? Math.max(8, Math.round(item.rect.width * scaleX * 100) / 100)
        : item.rect.width,
      height: isBox
        ? Math.max(8, Math.round(item.rect.height * scaleY * 100) / 100)
        : item.rect.height,
    };
  }

  return result;
}
