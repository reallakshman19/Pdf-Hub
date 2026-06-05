export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DEFAULT_DOCX_FONT_FAMILY = 'Aptos';
export const DEFAULT_DOCX_FONT_SIZE_PT = 11;

export const MAX_DOCX_IMAGE_WIDTH_PX = 624;
export const MAX_DOCX_IMAGE_HEIGHT_PX = 720;

export function ptToHalfPoints(pt: number): number {
  return Math.max(1, Math.round(pt * 2));
}

export function inchToTwip(inches: number): number {
  return Math.round(inches * 1440);
}

export function cssColorToDocxHex(color: string | undefined): string | undefined {
  if (!color) return undefined;

  const trimmed = color.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.slice(1).toUpperCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('');
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );

  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return [r, g, b]
      .map((part) => {
        const value = Math.max(0, Math.min(255, Number(part)));
        return value.toString(16).padStart(2, '0');
      })
      .join('')
      .toUpperCase();
  }

  return undefined;
}

export function clampImageSize(input: {
  width?: number | 'inherit';
  height?: number | 'inherit';
  fallbackWidth?: number;
  fallbackHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}): { width: number; height: number } {
  const width =
    typeof input.width === 'number'
      ? input.width
      : input.fallbackWidth ?? MAX_DOCX_IMAGE_WIDTH_PX;

  const height =
    typeof input.height === 'number'
      ? input.height
      : input.fallbackHeight ?? Math.round(width * 0.6);

  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const maxWidth = input.maxWidth ?? MAX_DOCX_IMAGE_WIDTH_PX;
  const maxHeight = input.maxHeight ?? MAX_DOCX_IMAGE_HEIGHT_PX;

  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function ptToTwip(pt: number): number {
  return Math.max(0, Math.round(pt * 20));
}

export function writerPointWidthToTableWidthPct(
  width: number | undefined,
  totalWidth: number | undefined,
): number | undefined {
  if (!width || !totalWidth || totalWidth <= 0) {
    return undefined;
  }

  const pct = (width / totalWidth) * 100;

  if (!Number.isFinite(pct) || pct <= 0) {
    return undefined;
  }

  return Math.max(1, Math.min(100, Math.round(pct * 100)));
}

/**
 * DOCX border size is measured in eighths of a point.
 */
export function ptToDocxBorderSize(pt: number | undefined): number {
  if (!pt || pt <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(pt * 8));
}
