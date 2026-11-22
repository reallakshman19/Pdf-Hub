/** Horizontal geometry for the three independently aligned slots in a band. */
export type HeaderFooterSlot = 'left' | 'center' | 'right';

export interface HeaderFooterSlotExtent {
  slot: HeaderFooterSlot;
  widthPt: number;
}

export function headerFooterSlotX(
  slot: HeaderFooterSlot,
  contentWidthPt: number,
  visualWidthPt: number,
  leftMarginPt: number,
  rightMarginPt: number,
): number {
  if (slot === 'left') return leftMarginPt;
  if (slot === 'center') return (visualWidthPt - contentWidthPt) / 2;
  return visualWidthPt - rightMarginPt - contentWidthPt;
}

/** Fail before drawing rather than producing overlapping native PDF content. */
export function assertNonOverlappingHeaderFooterSlots(
  entries: readonly HeaderFooterSlotExtent[],
  visualWidthPt: number,
  leftMarginPt: number,
  rightMarginPt: number,
  band: 'header' | 'footer',
): void {
  const spans = entries.map(({ slot, widthPt }) => {
    const start = headerFooterSlotX(
      slot, widthPt, visualWidthPt, leftMarginPt, rightMarginPt,
    );
    return { slot, start, end: start + widthPt };
  }).sort((a, b) => a.start - b.start);

  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1]!;
    const current = spans[index]!;
    if (current.start < previous.end) {
      throw new Error(
        `Header/footer ${band} slots ${previous.slot} and ${current.slot} overlap by `
        + `${(previous.end - current.start).toFixed(2)}pt. Shorten or resize one slot.`,
      );
    }
  }
}
