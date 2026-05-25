import React from 'react';
import type { SelectBoxInsertMode } from '@/core/select-box-copy/selectBoxCopyMode';
import {
  canUseTableMode,
  summarizeSelectBoxCopyResult,
} from '@/core/select-box-copy/selectBoxCopyMode';
import type {
  SelectBoxCopyResult,
  SelectBoxTableResult,
} from '@/core/select-box-copy/types';
import type { SelectBoxCopyMode } from '@/core/select-box-copy/clipboardWriter';
import {
  addTableDraftColumn,
  addTableDraftRow,
  createTableDraftFromResult,
  removeTableDraftColumn,
  removeTableDraftRow,
  tableDraftToResult,
  updateTableDraftCell,
  type SelectBoxTableDraft,
} from '@/core/select-box-copy/tableDraft';

export interface SelectBoxCopyResultPanelProps {
  result: SelectBoxCopyResult;
  onCopy: (mode: SelectBoxCopyMode, result: SelectBoxCopyResult) => void;
  onCopyImage: (result: SelectBoxCopyResult) => void;
  onInsertWriter: (
    mode: SelectBoxInsertMode,
    result: SelectBoxCopyResult,
  ) => void;
  onClose: () => void;
}

export const SelectBoxCopyResultPanel: React.FC<SelectBoxCopyResultPanelProps> = ({
  result,
  onCopy,
  onCopyImage,
  onInsertWriter,
  onClose,
}) => {
  const [showPreview, setShowPreview] = React.useState(false);
  const resultKey = React.useMemo(
    () =>
      JSON.stringify({
        plainText: result.plainText,
        table: result.table ?? null,
      }),
    [result],
  );
  const baseTableDraft = React.useMemo(
    () => (result.table ? createTableDraftFromResult(result.table) : null),
    [result],
  );
  const [draftState, setDraftState] = React.useState<{
    key: string;
    insertMode: SelectBoxInsertMode;
    tableDraft: SelectBoxTableDraft | null;
  } | null>(null);
  const insertMode =
    draftState?.key === resultKey ? draftState.insertMode : 'auto';
  const tableDraft =
    draftState?.key === resultKey ? draftState.tableDraft : baseTableDraft;

  const effectiveResult = React.useMemo(() => {
    if (!tableDraft) return result;

    const table: SelectBoxTableResult = tableDraftToResult(tableDraft);

    return {
      ...result,
      table,
      plainText: insertMode === 'table' ? table.tsv : result.plainText,
    };
  }, [insertMode, result, tableDraft]);

  const summary = summarizeSelectBoxCopyResult(effectiveResult);
  const canTable = canUseTableMode(effectiveResult);

  return (
    <div
      data-select-box-copy-ux-panel="true"
      aria-label="Select Box Copy result inspector"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 460,
        maxWidth: 760,
        padding: 8,
        borderRadius: 8,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.22)',
        pointerEvents: 'auto',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <strong>Select Box Copy</strong>
          <div style={{ color: '#64748b' }}>{summary.message}</div>
        </div>
        <ConfidenceBadge
          confidence={summary.tableConfidence}
          label={summary.confidenceLabel}
        />
      </div>

      <div
        data-select-box-copy-inspector="true"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          color: '#334155',
        }}
      >
        <Metric label="Items" value={summary.itemCount} />
        <Metric label="Rows" value={summary.rowCount} />
        <Metric label="Text" value={summary.plainTextLength} />
        <Metric label="Recommended" value={summary.recommendedMode} />
      </div>

      <div
        role="radiogroup"
        aria-label="Select Box Copy insert mode"
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        {(['auto', 'text', 'table', 'image'] as const).map((mode) => (
          <label
            key={mode}
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              color: mode === 'table' && !canTable ? '#94a3b8' : '#0f172a',
            }}
          >
            <input
              type="radio"
              name="select-box-copy-mode"
              value={mode}
              checked={insertMode === mode}
              disabled={mode === 'table' && !canTable}
              onChange={() =>
                setDraftState({
                  key: resultKey,
                  insertMode: mode,
                  tableDraft,
                })
              }
            />
            {mode}
          </label>
        ))}
      </div>

      {effectiveResult.plainText.trim() ? (
        <pre
          data-select-box-copy-text-preview="true"
          style={{
            maxHeight: 90,
            margin: 0,
            padding: 8,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
          }}
        >
          {effectiveResult.plainText}
        </pre>
      ) : (
        <div
          data-select-box-copy-empty-text="true"
          style={{
            padding: 8,
            borderRadius: 6,
            background: '#fff7ed',
            color: '#9a3412',
            border: '1px solid #fed7aa',
          }}
        >
          No text was found inside the selection. Use image mode for exact visual copy.
        </div>
      )}

      {canTable ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPreview((value) => !value)}
            style={secondaryButton}
          >
            {showPreview ? 'Hide Table Preview' : 'Show Table Preview'}
          </button>

          {showPreview && tableDraft ? (
            <TableDraftPreview
              draft={tableDraft}
              onChange={(nextDraft) =>
                setDraftState({
                  key: resultKey,
                  insertMode,
                  tableDraft: nextDraft,
                })
              }
            />
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <PanelButton
          label="Copy Text"
          onClick={() => onCopy('plain', effectiveResult)}
          disabled={!effectiveResult.plainText.trim()}
        />
        <PanelButton
          label="Copy Formatted"
          onClick={() => onCopy('formatted', effectiveResult)}
          disabled={!effectiveResult.plainText.trim()}
        />
        <PanelButton
          label="Copy Table"
          onClick={() => onCopy('table', effectiveResult)}
          disabled={!canTable}
        />
        <PanelButton
          label="Copy Image"
          onClick={() => onCopyImage(effectiveResult)}
        />
        <PanelButton
          label="Insert Writer"
          onClick={() => onInsertWriter(insertMode, effectiveResult)}
        />
        <PanelButton
          label="Close"
          onClick={onClose}
        />
      </div>
    </div>
  );
};

function ConfidenceBadge({
  confidence,
  label,
}: {
  confidence: number | null;
  label: string;
}): React.JSX.Element {
  const percent = confidence === null ? 'No table' : `${Math.round(confidence * 100)}%`;

  return (
    <span
      data-select-box-copy-confidence-badge="true"
      style={{
        alignSelf: 'start',
        padding: '3px 8px',
        borderRadius: 999,
        background: label === 'high'
          ? '#dcfce7'
          : label === 'medium'
            ? '#fef9c3'
            : label === 'low'
              ? '#fee2e2'
              : '#e2e8f0',
        color: label === 'high'
          ? '#166534'
          : label === 'medium'
            ? '#854d0e'
            : label === 'low'
              ? '#991b1b'
              : '#334155',
        fontWeight: 600,
      }}
    >
      {percent}
    </span>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): React.JSX.Element {
  return (
    <span style={{
      padding: '2px 6px',
      borderRadius: 999,
      background: '#f1f5f9',
    }}>
      {label}: {value}
    </span>
  );
}

function TableDraftPreview({
  draft,
  onChange,
}: {
  draft: SelectBoxTableDraft;
  onChange: (draft: SelectBoxTableDraft) => void;
}): React.JSX.Element {
  return (
    <div
      data-select-box-copy-table-preview="true"
      style={{
        marginTop: 8,
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => onChange(addTableDraftRow(draft))}
        >
          Add Row
        </button>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => onChange(addTableDraftColumn(draft))}
        >
          Add Column
        </button>
      </div>

      <div style={{ maxHeight: 180, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {draft.tableData.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={cell.id}
                    style={{
                      border: '1px solid #cbd5e1',
                      padding: 2,
                    }}
                  >
                    <input
                      aria-label={`Table cell ${rowIndex + 1}-${cellIndex + 1}`}
                      value={cell.text}
                      onChange={(event) => onChange(
                        updateTableDraftCell(
                          draft,
                          rowIndex,
                          cellIndex,
                          event.currentTarget.value,
                        ),
                      )}
                      style={{
                        width: '100%',
                        minWidth: 70,
                        border: 0,
                        outline: '1px solid transparent',
                        fontSize: 12,
                      }}
                    />
                  </td>
                ))}
                <td style={{ paddingLeft: 4 }}>
                  <button
                    type="button"
                    style={miniButton}
                    onClick={() => onChange(removeTableDraftRow(draft, rowIndex))}
                  >
                    −R
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {draft.tableData.columns.map((column, columnIndex) => (
                <td key={column.id} style={{ paddingTop: 4 }}>
                  <button
                    type="button"
                    style={miniButton}
                    onClick={() => onChange(removeTableDraftColumn(draft, columnIndex))}
                  >
                    −C{columnIndex + 1}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 28,
        padding: '0 8px',
        fontSize: 12,
        borderRadius: 5,
        border: '1px solid #cbd5e1',
        background: disabled ? '#f1f5f9' : '#ffffff',
        color: disabled ? '#94a3b8' : '#0f172a',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const secondaryButton: React.CSSProperties = {
  height: 26,
  padding: '0 8px',
  fontSize: 12,
  borderRadius: 5,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};

const miniButton: React.CSSProperties = {
  height: 22,
  padding: '0 5px',
  fontSize: 11,
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  cursor: 'pointer',
};
