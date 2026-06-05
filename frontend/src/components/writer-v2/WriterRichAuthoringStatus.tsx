import React from 'react';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
import { ensureRichTextEditing } from '@/core/writer-v2/ensureRichTextEditing';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';

export const WriterRichAuthoringStatus: React.FC = () => {
  const activeEditor = useActiveEditorStore((state) => state.activeEditor);
  const editingId = useWriterV2Store((state) => state.editingId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const activeId = useWriterV2Store((state) => state.activeId);
  const elements = useWriterV2Store((state) => state.elements);
  const endEditingWriterElement = useWriterV2Store((state) => state.endEditingWriterElement);
  const pageCount = useSessionStore((state) => state.pageCount);
  const sourceBytes = useSessionStore((state) => state.workingBytes ?? state.originalBytes);

  const [busy, setBusy] = React.useState(false);
  const hasOpenPdf = Boolean(sourceBytes && pageCount > 0);
  const selectedElement = elements.find((element) =>
    element.id === activeId || selectedIds.includes(element.id),
  );

  const startRichBox = async () => {
    if (!hasOpenPdf || busy) return;

    setBusy(true);
    try {
      await ensureRichTextEditing({
        starterTemplate: 'authoringCard',
        includeStarterTable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const status = getStatus({
    hasOpenPdf,
    busy,
    editingId,
    hasActiveEditor: Boolean(activeEditor),
  });

  return (
    <div
      data-writer-v2-rich-authoring-status="true"
      aria-label="Writer rich authoring status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        padding: '4px 8px',
        borderRadius: 9,
        border: `1px solid ${status.border}`,
        background: status.background,
        color: status.color,
        boxSizing: 'border-box',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: status.dot,
          flexShrink: 0,
        }}
      />

      <span
        style={{
          display: 'grid',
          gap: 1,
          minWidth: 0,
        }}
      >
        <strong
          style={{
            fontSize: 11,
            lineHeight: 1.05,
          }}
        >
          {status.label}
        </strong>
        <span
          title={selectedElement ? `${selectedElement.type} / ${selectedElement.id}` : undefined}
          style={{
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: 10,
            color: status.subtle,
          }}
        >
          {status.detail}
        </span>
      </span>

      {!activeEditor ? (
        <button
          type="button"
          onClick={() => {
            void startRichBox();
          }}
          disabled={!hasOpenPdf || busy}
          title="Create or open a rich Writer authoring box"
          style={{
            ...buttonStyle,
            opacity: !hasOpenPdf || busy ? 0.5 : 1,
            cursor: !hasOpenPdf || busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Opening...' : 'Start Writer Box'}
        </button>
      ) : (
        <button
          type="button"
          onClick={endEditingWriterElement}
          title="Finish the active rich text edit session"
          style={buttonStyle}
        >
          Finish Editing
        </button>
      )}
    </div>
  );
};

function getStatus({
  hasOpenPdf,
  busy,
  editingId,
  hasActiveEditor,
}: {
  hasOpenPdf: boolean;
  busy: boolean;
  editingId: string | null;
  hasActiveEditor: boolean;
}) {
  if (!hasOpenPdf) {
    return {
      label: 'Writer unavailable',
      detail: 'Open a PDF to use rich authoring.',
      dot: '#94a3b8',
      color: '#334155',
      subtle: '#64748b',
      border: '#cbd5e1',
      background: '#f8fafc',
    };
  }

  if (busy || (editingId && !hasActiveEditor)) {
    return {
      label: 'Opening editor',
      detail: 'Preparing the active rich text box...',
      dot: '#f59e0b',
      color: '#78350f',
      subtle: '#92400e',
      border: '#fcd34d',
      background: '#fffbeb',
    };
  }

  if (hasActiveEditor) {
    return {
      label: 'Editing active',
      detail: 'Ribbon commands apply to the current rich box.',
      dot: '#16a34a',
      color: '#064e3b',
      subtle: '#047857',
      border: '#86efac',
      background: '#ecfdf5',
    };
  }

  return {
    label: 'Smart authoring ready',
    detail: 'Ribbon commands will create/open a rich box.',
    dot: '#2563eb',
    color: '#1e3a8a',
    subtle: '#2563eb',
    border: '#93c5fd',
    background: '#eff6ff',
  };
}

const buttonStyle: React.CSSProperties = {
  height: 24,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: 10,
  fontWeight: 800,
};
