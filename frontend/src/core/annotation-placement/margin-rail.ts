// src/core/annotation-placement/margin-rail.ts
// ⚠️ INVARIANT: Margin-rail items are stacked vertically in order of their target's Y coordinate (AD-10).
// Never sort by text content or ID — only by targetPoint.y.

export interface RailSlot {
  occurrenceId: string;
  box: { x: number; y: number; width: number; height: number };
  leaderEnd: { x: number; y: number };
}

export interface MarginRailOptions {
  side: 'left' | 'right';
  pageWidth: number;
  pageHeight: number;
  margin: number;
  slotWidth: number;
  slotGap: number;
}

export function computeMarginRailSlots(
  targets: Array<{ id: string; y: number; height: number }>,
  options: MarginRailOptions,
): RailSlot[] {
  // Sort by Y ascending (top to bottom matches drawing order)
  const sorted = [...targets].sort((a, b) => a.y - b.y);

  const railX = options.side === 'right'
    ? options.pageWidth - options.margin - options.slotWidth
    : options.margin;

  let currentY = options.margin;
  return sorted.map((target) => {
    const slotY = Math.max(currentY, target.y - target.height / 2);
    currentY = slotY + target.height + options.slotGap;
    return {
      occurrenceId: target.id,
      box: { x: railX, y: slotY, width: options.slotWidth, height: target.height },
      leaderEnd: { x: railX + (options.side === 'right' ? 0 : options.slotWidth), y: slotY + target.height / 2 },
    };
  });
}
