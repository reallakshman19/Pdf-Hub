import React from 'react';
import { useSessionStore } from '@/core/session/store';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  sendSelectedWriterElementToBack,
  showAllWriterElements,
  toggleLockSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';

export interface WriterLayersPanelProps {
  embedded?: boolean;
}

export const WriterLayersPanel: React.FC<WriterLayersPanelProps> = ({
  embedded = false,
}) => {
  const elements = useWriterV2Store((state) => state.elements);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const activeId = useWriterV2Store((state) => state.activeId);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);

  const [currentPageOnly, setCurrentPageOnly] = React.useState(true);

  const visibleRows = React.useMemo(() => {
    const filtered = currentPageOnly
      ? elements.filter((element) => element.pageIndex === currentPage - 1)
      : elements;

    return filtered
      .slice()
      .sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        return b.style.zIndex - a.style.zIndex;
      });
  }, [currentPage, currentPageOnly, elements]);

  const hiddenCount = elements.filter((element) => element.hidden).length;

  if (elements.length === 0) {
    return null;
  }

  const selectOne = (id: string) => {
    dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id,
    });
  };

  const toggleOne = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];

    dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: next,
    });
  };

  const selectRow = (
    event: React.MouseEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleOne(id);
      return;
    }

    selectOne(id);
  };

  const selectAllVisible = () => {
    dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: visibleRows.map((element) => element.id),
    });
  };

  const clearSelection = () => {
    dispatchWriterCommand({
      type: 'CLEAR_WRITER_SELECTION',
    });
  };

  return (
    <aside
      data-writer-v2-layers-panel="true"
      aria-label="Writer V2 object layers"
      style={{
        width: embedded ? '100%' : 280,
        maxHeight: embedded ? undefined : 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: embedded ? 'none' : '1px solid #e2e8f0',
        borderRadius: embedded ? 0 : 10,
        boxShadow: embedded ? 'none' : '0 8px 28px rgba(15, 23, 42, 0.14)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
            Writer Objects
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {visibleRows.length} shown / {elements.length} total
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: '#475569',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={currentPageOnly}
            onChange={(event) => setCurrentPageOnly(event.target.checked)}
          />
          Page
        </label>
      </div>

      <div
        style={{
          padding: 6,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={visibleRows.length === 0}
          style={smallButtonStyle}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearSelection}
          disabled={selectedIds.length === 0}
          style={smallButtonStyle}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => { void showAllWriterElements(); }}
          disabled={hiddenCount === 0}
          style={smallButtonStyle}
        >
          Show hidden
        </button>
      </div>

      {selectedIds.length > 0 ? (
        <div
          style={{
            padding: 6,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 4,
            borderBottom: '1px solid #f1f5f9',
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={() => { void duplicateSelectedWriterElements(); }}
            style={smallButtonStyle}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => { void toggleLockSelectedWriterElements(); }}
            style={smallButtonStyle}
          >
            Lock
          </button>
          <button
            type="button"
            onClick={() => { void hideSelectedWriterElements(); }}
            style={smallButtonStyle}
          >
            Hide
          </button>
          <button
            type="button"
            onClick={() => { void bringSelectedWriterElementToFront(); }}
            style={smallButtonStyle}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => { void sendSelectedWriterElementToBack(); }}
            style={smallButtonStyle}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => { void deleteSelectedWriterElements(); }}
            style={{
              ...smallButtonStyle,
              color: '#dc2626',
              borderColor: '#fecaca',
              background: '#fff1f2',
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      <div
        role="list"
        aria-label="Writer V2 object list"
        style={{
          padding: 6,
          overflowY: 'auto',
        }}
      >
        {visibleRows.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: '#94a3b8',
              textAlign: 'center',
            }}
          >
            No Writer objects on this page.
          </div>
        ) : (
          visibleRows.map((element) => (
            <LayerRow
              key={element.id}
              element={element}
              selected={selectedIds.includes(element.id)}
              active={activeId === element.id}
              onSelect={selectRow}
            />
          ))
        )}
      </div>
    </aside>
  );
};

function LayerRow({
  element,
  selected,
  active,
  onSelect,
}: {
  element: WriterElementV2;
  selected: boolean;
  active: boolean;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>, id: string) => void;
}) {
  return (
    <div
      role="listitem"
      data-writer-v2-layer-row={element.id}
      style={{
        border: active
          ? '1px solid #2563eb'
          : selected
            ? '1px solid #93c5fd'
            : '1px solid #e2e8f0',
        background: element.hidden
          ? '#f8fafc'
          : active
            ? '#eff6ff'
            : selected
              ? '#f0f9ff'
              : '#ffffff',
        opacity: element.hidden ? 0.58 : 1,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 6,
      }}
    >
      <button
        type="button"
        onClick={(event) => onSelect(event, element.id)}
        aria-label={`Select writer object ${objectLabel(element)}`}
        title="Click to select. Ctrl/Cmd/Shift-click to multi-select."
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: elementColor(element),
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {objectLabel(element)}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              color: '#64748b',
            }}
          >
            p{element.pageIndex + 1} / z{element.style.zIndex} /{' '}
            {Math.round(element.rect.width)}x{Math.round(element.rect.height)}
          </span>
        </span>
        <span
          style={{
            fontSize: 9,
            color: '#64748b',
            whiteSpace: 'nowrap',
          }}
        >
          {element.locked ? 'Locked ' : ''}
          {element.hidden ? 'Hidden' : ''}
        </span>
      </button>
    </div>
  );
}

function objectLabel(element: WriterElementV2): string {
  const text = element.plainText?.trim();

  if (text) {
    return `${typeLabel(element.type)} - ${text.slice(0, 32)}`;
  }

  return `${typeLabel(element.type)} - ${element.id.slice(-6)}`;
}

function typeLabel(type: WriterElementV2['type']): string {
  switch (type) {
    case 'richTextBox':
      return 'Text Box';

    case 'textCallout':
      return 'Callout';

    case 'textStamp':
      return 'Stamp';

    case 'reviewLabel':
      return 'Review';

    case 'richNote':
      return 'Note';

    case 'tableBox':
      return 'Table';

    case 'imageBox':
      return 'Image';

    default:
      return type;
  }
}

function elementColor(element: WriterElementV2): string {
  switch (element.type) {
    case 'richTextBox':
      return '#2563eb';

    case 'textCallout':
      return '#7c3aed';

    case 'textStamp':
      return '#dc2626';

    case 'reviewLabel':
      return '#f59e0b';

    case 'richNote':
      return '#eab308';

    case 'tableBox':
      return '#0891b2';

    case 'imageBox':
      return '#0f766e';

    default:
      return '#64748b';
  }
}

const smallButtonStyle: React.CSSProperties = {
  height: 24,
  borderRadius: 5,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#334155',
  fontSize: 10,
  cursor: 'pointer',
};
