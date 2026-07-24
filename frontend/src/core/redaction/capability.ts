export type RedactionCapability =
  | 'visual-mask-only'
  | 'secure-redaction-supported';

/**
 * The browser-only build can cover page content visually, but it cannot prove
 * that underlying PDF text, images, annotations, or content streams were removed.
 */
export const REDACTION_CAPABILITY: RedactionCapability = 'visual-mask-only';

export const VISUAL_MASK_WARNING =
  'Visual masks only cover content. They do not permanently remove underlying PDF data.';

export function supportsSecureRedaction(
  capability: RedactionCapability = REDACTION_CAPABILITY,
): boolean {
  return capability === 'secure-redaction-supported';
}
