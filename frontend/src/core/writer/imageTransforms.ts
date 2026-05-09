import type {
  WriterImageCrop,
  WriterImageModel,
} from './types';

export function setImageRotation(
  image: WriterImageModel,
  rotation: number,
): WriterImageModel {
  return {
    ...image,
    rotation: normalizeRotation(rotation),
  };
}

export function rotateImageBy(
  image: WriterImageModel,
  delta: number,
): WriterImageModel {
  return setImageRotation(image, (image.rotation ?? 0) + delta);
}

export function setImageOpacity(
  image: WriterImageModel,
  opacity: number,
): WriterImageModel {
  return {
    ...image,
    opacity: Math.max(0, Math.min(1, opacity)),
  };
}

export function setImageBorder(
  image: WriterImageModel,
  input: {
    borderColor?: string;
    borderWidth?: number;
  },
): WriterImageModel {
  return {
    ...image,
    borderColor: input.borderColor ?? image.borderColor,
    borderWidth:
      typeof input.borderWidth === 'number'
        ? Math.max(0, input.borderWidth)
        : image.borderWidth,
  };
}

export function setImageAlt(
  image: WriterImageModel,
  alt: string,
): WriterImageModel {
  return {
    ...image,
    alt,
  };
}

export function setImageCrop(
  image: WriterImageModel,
  crop: WriterImageCrop | undefined,
): WriterImageModel {
  if (!crop) {
    return {
      ...image,
      crop: undefined,
    };
  }

  return {
    ...image,
    crop: normalizeCrop(crop),
  };
}

export function normalizeCrop(crop: WriterImageCrop): WriterImageCrop {
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const width = clamp01(crop.width);
  const height = clamp01(crop.height);

  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

export function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;

  return ((rotation % 360) + 360) % 360;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
