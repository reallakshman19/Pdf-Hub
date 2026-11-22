export type PdfRect = [number, number, number, number];

/**
 * The standard describes /RD as left, top, right, bottom. Some real files
 * encode the vertical pair in rectangle-coordinate order instead. A callout's
 * final /CL point meets its text box, allowing a source-specific choice when
 * one interpretation is clearly closer. Ambiguous cases use the standard.
 */
export function calloutBodyRect(outer: readonly number[], rd: readonly number[] | null, leader: readonly number[] | null = null): PdfRect | null {
  if (outer.length !== 4 || !outer.every(Number.isFinite)) return null;
  const [left, bottom, right, top] = outer;
  if (!(right > left && top > bottom)) return null;
  if (!rd) return [left, bottom, right, top];
  if (rd.length !== 4 || rd.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const standard: PdfRect = [left + rd[0], bottom + rd[3], right - rd[2], top - rd[1]];
  const alternate: PdfRect = [left + rd[0], bottom + rd[1], right - rd[2], top - rd[3]];
  if (!(standard[2] > standard[0] && standard[3] > standard[1])) return null;
  if (!leader || (leader.length !== 4 && leader.length !== 6) || !leader.every(Number.isFinite)) return standard;
  const x = leader[leader.length - 2]; const y = leader[leader.length - 1];
  const distance = (box: PdfRect) => {
    const outsideX = Math.max(box[0] - x, 0, x - box[2]);
    const outsideY = Math.max(box[1] - y, 0, y - box[3]);
    if (outsideX || outsideY) return Math.hypot(outsideX, outsideY);
    return Math.min(x - box[0], box[2] - x, y - box[1], box[3] - y);
  };
  return distance(alternate) + 1 < distance(standard) ? alternate : standard;
}

/** Enclose the text box and its leader, retaining the text box as /RD. */
export function enclosingCalloutRect(body: PdfRect, leader: readonly number[] | null): { rect: PdfRect; rd: [number, number, number, number] } {
  let [left, bottom, right, top] = body;
  if (leader && (leader.length === 4 || leader.length === 6) && leader.every(Number.isFinite)) {
    for (let i = 0; i < leader.length; i += 2) {
      // A small margin prevents the leader tip and its stroke being clipped.
      left = Math.min(left, leader[i] - 1);
      right = Math.max(right, leader[i] + 1);
      bottom = Math.min(bottom, leader[i + 1] - 1);
      top = Math.max(top, leader[i + 1] + 1);
    }
  }
  return {
    rect: [left, bottom, right, top],
    rd: [body[0] - left, top - body[3], right - body[2], body[1] - bottom],
  };
}
