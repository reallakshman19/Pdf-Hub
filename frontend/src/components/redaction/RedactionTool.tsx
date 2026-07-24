import type { JSX } from 'react';
import {
  REDACTION_CAPABILITY,
  VISUAL_MASK_WARNING,
  supportsSecureRedaction,
} from '@/core/redaction/capability';

/**
 * Browser-only masking guardrail. This surface deliberately avoids any action
 * that could be mistaken for permanent PDF redaction.
 */
export const RedactionTool = (): JSX.Element => {
  const secureRedactionAvailable = supportsSecureRedaction();

  return (
    <div
      role="note"
      data-redaction-capability={REDACTION_CAPABILITY}
      style={{
        padding: '1rem',
        border: '1px solid #f59e0b',
        borderRadius: '4px',
        backgroundColor: '#fff8e1',
      }}
    >
      <strong>Visual Mask (Not Secure Redaction)</strong>
      <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#555' }}>
        {VISUAL_MASK_WARNING}
      </p>
      <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#7c2d12' }}>
        {secureRedactionAvailable
          ? 'Secure redaction is available in this build.'
          : 'Secure redaction is unavailable. Exported masks may leave text searchable or extractable.'}
      </p>
    </div>
  );
};

export default RedactionTool;
