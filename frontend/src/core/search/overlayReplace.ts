import { v4 as uuidv4 } from 'uuid';
import type { BBoxHit } from './types';
import { useAnnotationStore } from '@/core/annotations/store';

export function createOverlayReplaceAnnotation(hit: BBoxHit, replacementText: string, fontSize: number = 12) {
  // We approximate the height for the overlay box to match the original bounding rect, and expand it slightly.
  // We apply a solid white background color to 'erase' the text visually, and write the new text on top.
  const newAnnotation = {
    id: uuidv4(),
    type: 'textbox' as const,
    pageNumber: hit.pageNumber,
    rect: {
      x: hit.rect.x,
      y: hit.rect.y,
      width: Math.max(hit.rect.width, replacementText.length * (fontSize * 0.6)), // roughly scale box to match text size natively
      height: Math.max(hit.rect.height, fontSize * 1.5), 
    },
    data: {
      text: replacementText,
      fontSize,
      fillColor: '#ffffff', // opaque background masks original text
      strokeColor: 'transparent',
      strokeWidth: 0,
      textColor: '#0f172a',
      textAlign: 'left' as const,
      zIndex: 100, // force on top
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  useAnnotationStore.getState().addAnnotation(newAnnotation);
}
