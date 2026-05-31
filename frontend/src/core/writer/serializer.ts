import type { PlacedElement } from './types';

/**
 * Serialise writer elements into a JSON serialisable form.  The
 * identity of the element is preserved and any complex fields are
 * copied shallowly.  Real implementations might need to encode
 * embedded images as data URIs or cross‑reference them via file
 * attachments.  Here we simply return the elements unchanged.
 */
export function serialiseWriterElements(elements: PlacedElement[]): unknown {
  return elements.map((e) => ({ ...e }));
}