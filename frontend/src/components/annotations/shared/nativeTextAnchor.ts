import type { Rect } from '../../../core/annotations/types';

/** The native Text icon is anchored at the PDF rectangle's upper-left corner. */
export function nativeTextDisplayRect(rect: Rect, pageRotation: number): Rect {
  const rotation = ((pageRotation % 360) + 360) % 360;
  return {
    x: rect.x + (rotation === 90 || rotation === 180 ? rect.width : 0),
    y: rect.y + (rotation === 180 || rotation === 270 ? rect.height : 0),
    width: rotation === 90 || rotation === 270 ? rect.height : rect.width,
    height: rotation === 90 || rotation === 270 ? rect.width : rect.height,
  };
}
