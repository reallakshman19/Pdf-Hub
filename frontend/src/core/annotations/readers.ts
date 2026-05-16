import type { PdfAnnotation } from './types';

export function readFillColor(annotation: PdfAnnotation, fallback = 'transparent'): string {
  if (typeof annotation.data.fillColor === 'string') return annotation.data.fillColor;
  if (typeof annotation.data.backgroundColor === 'string') return annotation.data.backgroundColor;
  
  if (annotation.type === 'highlight') return '#fde047';
  if (annotation.type === 'comment') return '#fff7cc';
  if (annotation.type === 'stamp') return '#fef2f2';
  if (annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse') return 'transparent';
  return fallback;
}

export function readStrokeColor(annotation: PdfAnnotation, fallback = '#60a5fa'): string {
  if (typeof annotation.data.strokeColor === 'string') return annotation.data.strokeColor;
  if (typeof annotation.data.borderColor === 'string') return annotation.data.borderColor;

  if (annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse') return '#3b82f6';
  if (annotation.type === 'stamp') return '#ef4444';
  return fallback;
}

export function readStrokeWidth(annotation: PdfAnnotation, fallback = 1): number {
  if (typeof annotation.data.strokeWidth === 'number') return annotation.data.strokeWidth;
  if (typeof annotation.data.borderWidth === 'number') return annotation.data.borderWidth;

  if (annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse') return 2;
  if (annotation.type === 'stamp') return 3;
  return fallback;
}
