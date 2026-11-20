/** One point on the baseline, with a signed displacement toward the text top. */
export interface SquigglePoint { fraction: number; displacement: number }

/** Keep generated artwork and its interactive preview within the same bound. */
export const MAX_PREVIEW_MARKUP_QUADS = 256;

/** Bound total geometry while allowing a typical single quad up to 256 segments. */
export function squiggleSegmentBudget(quadCount: number): number {
  if (!Number.isInteger(quadCount) || quadCount <= 0) return 4;
  return Math.max(4, Math.min(256, Math.floor(4096 / quadCount)));
}

/** Shared PDF-unit waveform. Renderers map fraction and displacement into their coordinates. */
export function squiggleWave(length: number, textHeight: number, segmentBudget: number): SquigglePoint[] {
  if (![length, textHeight, segmentBudget].every(Number.isFinite) || length <= 0 || textHeight <= 0) return [];
  // PDF coordinates can acquire tiny floating point errors after translating
  // the page origin. Quantize before choosing a discrete segment count so the
  // same line does not gain a segment when saved and reopened.
  const stableLength = Math.round(Math.min(length, 1024) * 100000) / 100000;
  const steps = Math.max(4, Math.min(256, Math.floor(segmentBudget), Math.ceil(stableLength / 4)));
  const amplitude = Math.min(1.8, Math.max(1, textHeight) * 0.10);
  const result: SquigglePoint[] = [{ fraction: 0, displacement: 0 }];
  for (let step = 1; step <= steps; step += 1) {
    result.push({ fraction: step / steps, displacement: step === steps ? 0 : (step % 2 === 0 ? -amplitude : amplitude) });
  }
  return result;
}
