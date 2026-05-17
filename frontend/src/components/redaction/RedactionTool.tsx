import type { JSX } from 'react';

/**
 * Placeholder component for the Redaction tool. In the preview
 * implementation of DocCraft there is no ability to perform true
 * redaction—removing PDF content requires a server‑side pipeline. This
 * component communicates that limitation to the user and provides a simple
 * affordance for enabling redaction preview mode when integrated with the
 * viewer (not implemented here).
 */
export const RedactionTool = (): JSX.Element => {
  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #ccc',
        borderRadius: '4px',
        backgroundColor: '#fff8e1',
      }}
    >
      <strong>Redaction (Preview Only)</strong>
      <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#555' }}>
        Marking regions for redaction is available in preview mode. Final
        redaction (permanently removing PDF content) requires a server‑side
        implementation and is not yet available.
      </p>
    </div>
  );
};

export default RedactionTool;
