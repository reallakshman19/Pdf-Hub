export type RedactionCapability =
  | 'visual-mask-only'
  | 'secure-redaction-supported';

/**
 * Phase 9 provides client-side irreversible content stream sanitization,
 * /Annots purging, opaque vector bake-in, and cryptographic audit manifests.
 */
export const REDACTION_CAPABILITY: RedactionCapability = 'secure-redaction-supported';

export const VISUAL_MASK_WARNING =
  'Visual masks only cover content. They do not permanently remove underlying PDF data.';

export function supportsSecureRedaction(
  capability: RedactionCapability = REDACTION_CAPABILITY,
): boolean {
  return capability === 'secure-redaction-supported';
}
