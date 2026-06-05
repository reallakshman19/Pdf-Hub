import React from 'react';
import { useSessionStore } from '@/core/session/store';
import {
  discardWriterDraftForCurrentDocument,
  loadWriterDraftForCurrentDocument,
  recoverWriterDraftForCurrentDocument,
} from '@/core/writer-v2/persistence/writerAutosave';

/**
 * Shows restore/discard controls when browser storage contains a Writer V2 draft.
 * Inputs: active session document; output: floating recovery UI; fallback: user can dismiss without mutation.
 */
export const WriterRecoveryBanner: React.FC = () => {
  const documentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);

  const [draft, setDraft] = React.useState<{
    documentFingerprint: string;
    elementCount: number;
    assetCount: number;
    updatedAt: string;
  } | null>(null);

  const [dismissedForKey, setDismissedForKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function checkDraft() {
      if (!documentKey) {
        setDraft(null);
        return;
      }

      if (dismissedForKey === documentKey) {
        return;
      }

      const result = await loadWriterDraftForCurrentDocument();

      if (cancelled) return;

      if (!result?.document || result.document.elements.length === 0) {
        setDraft(null);
        return;
      }

      setDraft({
        documentFingerprint: result.documentFingerprint,
        elementCount: result.document.elements.length,
        assetCount: result.assetCount,
        updatedAt: result.document.updatedAt,
      });
    }

    void checkDraft();

    return () => {
      cancelled = true;
    };
  }, [documentKey, dismissedForKey]);

  if (!draft || !documentKey) {
    return null;
  }

  const dismiss = () => {
    setDismissedForKey(documentKey);
    setDraft(null);
  };

  const recover = async () => {
    await recoverWriterDraftForCurrentDocument();
    dismiss();
  };

  const discard = async () => {
    await discardWriterDraftForCurrentDocument();
    dismiss();
  };

  return (
    <div
      role="status"
      aria-label="Recover Writer V2 draft"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 32,
        transform: 'translateX(-50%)',
        zIndex: 460,
        width: 'min(640px, calc(100vw - 32px))',
        background: '#0f172a',
        color: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 16px 44px rgba(15, 23, 42, 0.35)',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            marginBottom: 2,
          }}
        >
          Recover Writer draft?
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#cbd5e1',
          }}
        >
          Found {draft.elementCount} Writer object(s)
          {draft.assetCount > 0 ? ` and ${draft.assetCount} asset(s)` : ''} for{' '}
          {fileName ?? 'this document'}.
          Last saved {formatTimestamp(draft.updatedAt)}.
        </div>
      </div>

      <button
        type="button"
        onClick={recover}
        style={primaryButtonStyle}
      >
        Restore
      </button>

      <button
        type="button"
        onClick={discard}
        style={secondaryButtonStyle}
      >
        Discard
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss Writer draft recovery"
        style={ghostButtonStyle}
      >
        x
      </button>
    </div>
  );
};

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

const primaryButtonStyle: React.CSSProperties = {
  height: 30,
  border: '1px solid #38bdf8',
  background: '#0284c7',
  color: '#ffffff',
  borderRadius: 7,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 30,
  border: '1px solid #475569',
  background: '#1e293b',
  color: '#e2e8f0',
  borderRadius: 7,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  color: '#cbd5e1',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
};
