import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Baseline,
  BetweenHorizontalStart,
  Grid,
  CaseSensitive,
  Columns3,
  PaintBucket,
  Rows3,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  dispatchDurableWriterUiCommand,
} from '@/core/writer-v2/durableWriterUiDispatch';
import type {
  WriterV2CommandResult,
} from '@/core/writer-v2/writerCommandStore';
import type {
  WriterElementV2,
} from '@/core/writer-v2/types';
import type {
  WriterTableBorderStyle,
  WriterTableCellStyle,
} from '@/core/writer-v2/types';
import {
  createSingleCellSelection,
  type WriterTableSelection,
} from '@/core/writer-v2/table-pro/writerTableSelection';
import {
  buildDeleteTableColumnCommand,
  buildDeleteTableRowCommand,
  buildInsertTableColumnCommand,
  buildInsertTableRowCommand,
  buildMergeTableCellsCommand,
  buildNormalizeTableCommand,
  buildResizeTableColumnCommand,
  buildSetTableCellBorderCommand,
  buildSetTableCellFillCommand,
  buildSetTableCellHorizontalAlignmentCommand,
  buildSetTableCellPaddingCommand,
  buildSetTableCellVerticalAlignmentCommand,
  buildSetTableHeaderRowCommand,
  buildSplitTableCellCommand,
  buildUpdateTableCellTextCommand,
  type WriterTableCommandBridgeResult,
} from '@/core/writer-v2/table-pro/writerTableCommandBridge';

export interface WriterTablePropertiesPanelProps {
  tableSelection?: WriterTableSelection | null;
  onTableSelectionChange?: (selection: WriterTableSelection | null) => void;
}

interface TableDraftCommitResult {
  changed: boolean;
}

function TableDraftTextInput({
  value,
  onCommit,
  resetKey,
  ariaLabel,
}: {
  value: string;
  onCommit: (
    value: string,
  ) => Promise<TableDraftCommitResult>;
  resetKey: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] =
    React.useState(value);
  const cancelBlurRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(value);
    cancelBlurRef.current = false;
  }, [resetKey, value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(value);
      return;
    }

    if (draft === value) return;

    void onCommit(draft)
      .then((result) => {
        if (!result.changed) {
          setDraft(value);
        }
      })
      .catch(() => {
        setDraft(value);
      });
  };

  return (
    <input
      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
      value={draft}
      onChange={(event) =>
        setDraft(event.currentTarget.value)
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          cancelBlurRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
    />
  );
}

function TableDraftNumberInput({
  value,
  onCommit,
  resetKey,
  ariaLabel,
  min,
  max,
  step = 1,
}: {
  value: number;
  onCommit: (
    value: number,
  ) => Promise<TableDraftCommitResult>;
  resetKey: string;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] =
    React.useState(String(value));
  const cancelBlurRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(String(value));
    cancelBlurRef.current = false;
  }, [resetKey, value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(String(value));
      return;
    }

    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const next = Math.max(
      min ?? Number.NEGATIVE_INFINITY,
      Math.min(
        max ?? Number.POSITIVE_INFINITY,
        parsed,
      ),
    );

    setDraft(String(next));

    if (next === value) return;

    void onCommit(next)
      .then((result) => {
        if (!result.changed) {
          setDraft(String(value));
        }
      })
      .catch(() => {
        setDraft(String(value));
      });
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
      value={draft}
      onChange={(event) =>
        setDraft(event.currentTarget.value)
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          cancelBlurRef.current = true;
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
    />
  );
}

function TableDraftColorInput({
  value,
  onCommit,
  resetKey,
  ariaLabel,
}: {
  value: string;
  onCommit: (
    value: string,
  ) => Promise<TableDraftCommitResult>;
  resetKey: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] =
    React.useState(value);
  const timerRef =
    React.useRef<number | null>(null);

  React.useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraft(value);
  }, [resetKey, value]);

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const scheduleCommit = (next: string) => {
    setDraft(next);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        if (next === value) return;

        void onCommit(next)
          .then((result) => {
            if (!result.changed) {
              setDraft(value);
            }
          })
          .catch(() => {
            setDraft(value);
          });
      },
      250,
    );
  };

  return (
    <input
      type="color"
      className="mt-1 h-8 w-full rounded border border-slate-300"
      value={draft}
      onChange={(event) =>
        scheduleCommit(
          event.currentTarget.value,
        )
      }
      aria-label={ariaLabel}
    />
  );
}

export const WriterTablePropertiesPanel: React.FC<
  WriterTablePropertiesPanelProps
> = ({
  tableSelection,
  onTableSelectionChange,
}) => {
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const tableCommitTailRef =
    React.useRef<Promise<void>>(
      Promise.resolve(),
    );

  const runDurableCommand =
    React.useCallback((
      context: string,
      builder: (
        latestElements: WriterElementV2[],
      ) => WriterTableCommandBridgeResult,
    ): Promise<WriterV2CommandResult | null> => {
      const run =
        tableCommitTailRef.current.then(
          async () => {
            const result = builder(
              useWriterV2Store
                .getState()
                .elements,
            );

            if (!result.command) {
              return null;
            }

            return dispatchDurableWriterUiCommand(
              result.command,
              context,
            );
          },
        );

      tableCommitTailRef.current =
        run.then(
          () => undefined,
          () => undefined,
        );

      return run;
    }, []);

  const table = React.useMemo(() => {
    const preferredId = activeId ?? selectedIds[0] ?? null;

    if (!preferredId) return null;

    const element = elements.find((item) => item.id === preferredId);

    return element?.type === 'tableBox' ? element : null;
  }, [activeId, elements, selectedIds]);

  const [localSelectedCell, setLocalSelectedCell] = React.useState({
    rowIndex: 0,
    columnIndex: 0,
  });

  const selectedCell = React.useMemo(() => {
    const raw = tableSelection && tableSelection.elementId === table?.id
      && tableSelection.cells.length > 0
      ? {
          rowIndex: tableSelection.cells[0].rowIndex,
          columnIndex: tableSelection.cells[0].columnIndex,
        }
      : localSelectedCell;

    const maxRow = Math.max(0, (table?.tableData?.rows.length ?? 1) - 1);
    const maxCol = Math.max(0, (table?.tableData?.columns.length ?? 1) - 1);

    return {
      rowIndex: clamp(raw.rowIndex, 0, maxRow),
      columnIndex: clamp(raw.columnIndex, 0, maxCol),
    };
  }, [tableSelection, table?.id, table?.tableData?.rows, table?.tableData?.columns, localSelectedCell]);

  const setSelectedCell = React.useCallback((
    updater:
      | { rowIndex: number; columnIndex: number }
      | ((current: { rowIndex: number; columnIndex: number }) => {
          rowIndex: number;
          columnIndex: number;
        }),
  ) => {
    const next = typeof updater === 'function'
      ? updater(selectedCell)
      : updater;

    setLocalSelectedCell(next);

    if (table && onTableSelectionChange) {
      onTableSelectionChange({
        elementId: table.id,
        cells: [
          {
            elementId: table.id,
            rowIndex: next.rowIndex,
            columnIndex: next.columnIndex,
          },
        ],
      });
    }
  }, [onTableSelectionChange, selectedCell, table]);

  if (!table || !table.tableData) {
    return null;
  }

  const tableData = table.tableData;
  const currentCell = tableData.rows[selectedCell.rowIndex]?.cells[selectedCell.columnIndex];
  const currentColumn = tableData.columns[selectedCell.columnIndex];
  const currentStyle = currentCell?.style ?? {};

  const selection = createSingleCellSelection(
    table.id,
    selectedCell.rowIndex,
    selectedCell.columnIndex,
  );

  const effectiveSelection: WriterTableSelection = tableSelection && tableSelection.elementId === table.id
    && tableSelection.cells.length > 0
      ? tableSelection
      : selection;

  const selectedCellCount = effectiveSelection.cells.length;
  const canMergeCells = selectedCellCount >= 2;

  const runCommand = (
    context: string,
    builder: (
      latestElements: WriterElementV2[],
    ) => WriterTableCommandBridgeResult,
  ): Promise<TableDraftCommitResult> =>
    runDurableCommand(
      context,
      builder,
    ).then((result) => ({
      changed: result?.changed ?? false,
    }));

  const freezeSelection = () => ({
    elementId: effectiveSelection.elementId,
    cells: effectiveSelection.cells.map(
      (cell) => ({ ...cell }),
    ),
  });

  const setHorizontalAlignment = (
    alignment: NonNullable<WriterTableCellStyle['alignment']>,
  ) => {
    const selectionAtInvocation =
      freezeSelection();
    void runCommand(
      'WriterTableProperties horizontal alignment',
      (latestElements) =>
        buildSetTableCellHorizontalAlignmentCommand(
          latestElements,
          selectionAtInvocation,
          alignment,
        ),
    ).catch(() => undefined);
  };

  const setVerticalAlignment = (
    verticalAlign: NonNullable<WriterTableCellStyle['verticalAlign']>,
  ) => {
    const selectionAtInvocation =
      freezeSelection();
    void runCommand(
      'WriterTableProperties vertical alignment',
      (latestElements) =>
        buildSetTableCellVerticalAlignmentCommand(
          latestElements,
          selectionAtInvocation,
          verticalAlign,
        ),
    ).catch(() => undefined);
  };

  const setFill = (
    backgroundColor: string,
  ): Promise<TableDraftCommitResult> => {
    const selectionAtInvocation =
      freezeSelection();
    return runCommand(
      'WriterTableProperties fill',
      (latestElements) =>
        buildSetTableCellFillCommand(
          latestElements,
          selectionAtInvocation,
          backgroundColor || undefined,
        ),
    );
  };

  const setPadding = (
    padding: number,
  ): Promise<TableDraftCommitResult> => {
    const selectionAtInvocation =
      freezeSelection();
    return runCommand(
      'WriterTableProperties padding',
      (latestElements) =>
        buildSetTableCellPaddingCommand(
          latestElements,
          selectionAtInvocation,
          padding,
        ),
    );
  };

  const setBorder = (
    patch: Partial<{
      style: WriterTableBorderStyle;
      color: string;
      width: number;
    }>,
  ): Promise<TableDraftCommitResult> => {
    const selectionAtInvocation =
      freezeSelection();
    const rowIndex =
      selectedCell.rowIndex;
    const columnIndex =
      selectedCell.columnIndex;
    const tableId = table.id;

    return runCommand(
      'WriterTableProperties border',
      (latestElements) => {
        const latestStyle =
          resolveLatestTableCellStyle(
            latestElements,
            tableId,
            rowIndex,
            columnIndex,
          );
        const latestBorder =
          latestStyle.borders?.top;

        return buildSetTableCellBorderCommand(
          latestElements,
          selectionAtInvocation,
          'all',
          {
            style:
              patch.style
              ?? latestBorder?.style
              ?? 'single',
            color:
              patch.color
              ?? latestBorder?.color
              ?? '#CBD5E1',
            width:
              patch.width
              ?? latestBorder?.width
              ?? 0.5,
          },
        );
      },
    );
  };

  const setHeaderRow = (
    hasHeaderRow: boolean,
  ) => {
    const tableId = table.id;
    void runCommand(
      'WriterTableProperties header row',
      (latestElements) =>
        buildSetTableHeaderRowCommand(
          latestElements,
          tableId,
          hasHeaderRow,
        ),
    ).catch(() => undefined);
  };

  const resizeColumn = (
    width: number,
  ): Promise<TableDraftCommitResult> => {
    if (!currentColumn) {
      return Promise.resolve({
        changed: false,
      });
    }

    const tableId = table.id;
    const columnId = currentColumn.id;

    return runCommand(
      'WriterTableProperties column width',
      (latestElements) =>
        buildResizeTableColumnCommand(
          latestElements,
          tableId,
          columnId,
          width,
        ),
    );
  };

  const updateCellText = (
    text: string,
  ): Promise<TableDraftCommitResult> => {
    const tableId = table.id;
    const rowIndex =
      selectedCell.rowIndex;
    const columnIndex =
      selectedCell.columnIndex;

    return runCommand(
      'WriterTableProperties cell text',
      (latestElements) =>
        buildUpdateTableCellTextCommand(
          latestElements,
          tableId,
          rowIndex,
          columnIndex,
          text,
        ),
    );
  };

  const insertRowAbove = () => {
    const tableId = table.id;
    const rowIndex =
      selectedCell.rowIndex;
    void runCommand(
      'WriterTableProperties insert row above',
      (latestElements) =>
        buildInsertTableRowCommand(
          latestElements,
          tableId,
          rowIndex,
          'above',
        ),
    ).catch(() => undefined);
  };

  const insertRowBelow = () => {
    const tableId = table.id;
    const rowIndex =
      selectedCell.rowIndex;
    void runCommand(
      'WriterTableProperties insert row below',
      (latestElements) =>
        buildInsertTableRowCommand(
          latestElements,
          tableId,
          rowIndex,
          'below',
        ),
    ).catch(() => undefined);
  };

  const deleteRow = () => {
    const tableId = table.id;
    const rowIndex =
      selectedCell.rowIndex;
    void runCommand(
      'WriterTableProperties delete row',
      (latestElements) =>
        buildDeleteTableRowCommand(
          latestElements,
          tableId,
          rowIndex,
        ),
    ).catch(() => undefined);
  };

  const insertColumnLeft = () => {
    const tableId = table.id;
    const columnIndex =
      selectedCell.columnIndex;
    void runCommand(
      'WriterTableProperties insert column left',
      (latestElements) =>
        buildInsertTableColumnCommand(
          latestElements,
          tableId,
          columnIndex,
          'left',
        ),
    ).catch(() => undefined);
  };

  const insertColumnRight = () => {
    const tableId = table.id;
    const columnIndex =
      selectedCell.columnIndex;
    void runCommand(
      'WriterTableProperties insert column right',
      (latestElements) =>
        buildInsertTableColumnCommand(
          latestElements,
          tableId,
          columnIndex,
          'right',
        ),
    ).catch(() => undefined);
  };

  const deleteColumn = () => {
    const tableId = table.id;
    const columnIndex =
      selectedCell.columnIndex;
    void runCommand(
      'WriterTableProperties delete column',
      (latestElements) =>
        buildDeleteTableColumnCommand(
          latestElements,
          tableId,
          columnIndex,
        ),
    ).catch(() => undefined);
  };

  const mergeSelectedCells = () => {
    const selectionAtInvocation =
      freezeSelection();
    void runCommand(
      'WriterTableProperties merge cells',
      (latestElements) =>
        buildMergeTableCellsCommand(
          latestElements,
          selectionAtInvocation,
        ),
    ).catch(() => undefined);
  };

  const splitSelectedCell = () => {
    const tableId = table.id;
    const rowIndex =
      selectedCell.rowIndex;
    const columnIndex =
      selectedCell.columnIndex;
    void runCommand(
      'WriterTableProperties split cell',
      (latestElements) =>
        buildSplitTableCellCommand(
          latestElements,
          tableId,
          rowIndex,
          columnIndex,
        ),
    ).catch(() => undefined);
  };

  const normalizeTable = () => {
    const tableId = table.id;
    void runCommand(
      'WriterTableProperties normalize table',
      (latestElements) =>
        buildNormalizeTableCommand(
          latestElements,
          tableId,
        ),
    ).catch(() => undefined);
  };

  return (
    <aside
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      aria-label="Table properties"
      data-writer-table-properties="true"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Table Properties
          </h3>
          <p className="text-xs text-slate-500">
            {tableData.rows.length} rows × {tableData.columns.length} columns
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={tableData.hasHeaderRow !== false}
            onChange={(event) => setHeaderRow(event.currentTarget.checked)}
          />
          Header
        </label>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Row
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={selectedCell.rowIndex}
            onChange={(event) =>
              setSelectedCell((current) => ({
                ...current,
                rowIndex: Number(event.currentTarget.value),
              }))
            }
          >
            {tableData.rows.map((row, index) => (
              <option key={row.id} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          Column
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
            value={selectedCell.columnIndex}
            onChange={(event) =>
              setSelectedCell((current) => ({
                ...current,
                columnIndex: Number(event.currentTarget.value),
              }))
            }
          >
            {tableData.columns.map((column, index) => (
              <option key={column.id} value={index}>
                {column.label ?? column.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PanelSection title="Structure" icon={Rows3}>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={insertRowAbove}
          >
            Row above
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={insertRowBelow}
          >
            Row below
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={deleteRow}
            disabled={tableData.rows.length <= 1}
          >
            Delete row
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={normalizeTable}
          >
            Normalize
          </Button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={insertColumnLeft}
          >
            Column left
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={insertColumnRight}
          >
            Column right
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={deleteColumn}
            disabled={tableData.columns.length <= 1}
          >
            Delete column
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={mergeSelectedCells}
            disabled={!canMergeCells}
            title={
              canMergeCells
                ? 'Merge selected table cells'
                : 'Drag-select at least two table cells to merge'
            }
          >
            Merge cells
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-xs"
            onClick={splitSelectedCell}
          >
            Split cell
          </Button>
        </div>

        <p className="mt-2 text-[11px] text-slate-500">
          Selected cells: {selectedCellCount}
        </p>
      </PanelSection>

      <PanelSection title="Cell text" icon={CaseSensitive}>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          value={currentCell?.text ?? ''}
          onChange={(event) => updateCellText(event.currentTarget.value)}
          aria-label="Selected table cell text"
        />
      </PanelSection>

      <PanelSection title="Horizontal alignment" icon={Baseline}>
        <ButtonGroup>
          <IconButton
            label="Left"
            active={currentStyle.alignment === 'left'}
            icon={AlignLeft}
            onClick={() => setHorizontalAlignment('left')}
          />
          <IconButton
            label="Center"
            active={currentStyle.alignment === 'center'}
            icon={AlignCenter}
            onClick={() => setHorizontalAlignment('center')}
          />
          <IconButton
            label="Right"
            active={currentStyle.alignment === 'right'}
            icon={AlignRight}
            onClick={() => setHorizontalAlignment('right')}
          />
          <IconButton
            label="Justify"
            active={currentStyle.alignment === 'justify'}
            icon={AlignJustify}
            onClick={() => setHorizontalAlignment('justify')}
          />
        </ButtonGroup>
      </PanelSection>

      <PanelSection title="Vertical alignment" icon={BetweenHorizontalStart}>
        <ButtonGroup>
          <IconButton
            label="Top"
            active={currentStyle.verticalAlign === 'top'}
            icon={ArrowUpToLine}
            onClick={() => setVerticalAlignment('top')}
          />
          <IconButton
            label="Middle"
            active={currentStyle.verticalAlign === 'middle'}
            icon={BetweenHorizontalStart}
            onClick={() => setVerticalAlignment('middle')}
          />
          <IconButton
            label="Bottom"
            active={currentStyle.verticalAlign === 'bottom'}
            icon={ArrowDownToLine}
            onClick={() => setVerticalAlignment('bottom')}
          />
        </ButtonGroup>
      </PanelSection>

      <PanelSection title="Fill and padding" icon={PaintBucket}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-600">
            Fill
            <input
              type="color"
              className="mt-1 h-8 w-full rounded border border-slate-300"
              value={normalizeColorInput(currentStyle.backgroundColor)}
              onChange={(event) => setFill(event.currentTarget.value)}
            />
          </label>

          <label className="text-xs text-slate-600">
            Padding
            <input
              type="number"
              min={0}
              max={48}
              step={1}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={currentStyle.padding ?? tableData.defaultCellStyle?.padding ?? 6}
              onChange={(event) => setPadding(Number(event.currentTarget.value))}
            />
          </label>
        </div>
      </PanelSection>

      <PanelSection title="Border" icon={Grid}>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-600">
            Style
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={currentStyle.borders?.top?.style ?? 'single'}
              onChange={(event) =>
                setBorder(
                  event.currentTarget.value as WriterTableBorderStyle,
                  currentStyle.borders?.top?.color ?? '#CBD5E1',
                  currentStyle.borders?.top?.width ?? 0.5,
                )
              }
            >
              <option value="single">Single</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="double">Double</option>
              <option value="none">None</option>
            </select>
          </label>

          <label className="text-xs text-slate-600">
            Color
            <input
              type="color"
              className="mt-1 h-8 w-full rounded border border-slate-300"
              value={normalizeColorInput(currentStyle.borders?.top?.color)}
              onChange={(event) =>
                setBorder(
                  currentStyle.borders?.top?.style ?? 'single',
                  event.currentTarget.value,
                  currentStyle.borders?.top?.width ?? 0.5,
                )
              }
            />
          </label>

          <label className="text-xs text-slate-600">
            Width
            <input
              type="number"
              min={0}
              max={6}
              step={0.25}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={currentStyle.borders?.top?.width ?? 0.5}
              onChange={(event) =>
                setBorder(
                  currentStyle.borders?.top?.style ?? 'single',
                  currentStyle.borders?.top?.color ?? '#CBD5E1',
                  Number(event.currentTarget.value),
                )
              }
            />
          </label>
        </div>
      </PanelSection>

      <PanelSection title="Column width" icon={Columns3}>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-slate-600">
            Width
            <input
              type="number"
              min={8}
              max={2000}
              step={1}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              value={currentColumn?.width ?? Math.round(table.rect.width / Math.max(1, tableData.columns.length))}
              onChange={(event) => resizeColumn(Number(event.currentTarget.value))}
            />
          </label>

          <span className="pb-1 text-xs text-slate-500">
            pt
          </span>
        </div>
      </PanelSection>

      <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-500">
        Selected cell: row {selectedCell.rowIndex + 1}, column {selectedCell.columnIndex + 1}
      </div>
    </aside>
  );
};

function PanelSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </section>
  );
}

function ButtonGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1">
      {children}
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label}>
      <Button
        size="icon"
        variant={active ? 'secondary' : 'ghost'}
        className="h-8 w-8"
        aria-label={label}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}

function resolveLatestTableCellStyle(
  elements: WriterElementV2[],
  tableId: string,
  rowIndex: number,
  columnIndex: number,
): WriterTableCellStyle {
  const table = elements.find(
    (element) =>
      element.id === tableId
      && element.type === 'tableBox',
  );

  return table?.tableData
    ?.rows[rowIndex]
    ?.cells[columnIndex]
    ?.style
    ?? {};
}

function normalizeColorInput(value: string | undefined): string {
  if (!value) return '#ffffff';

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return '#ffffff';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
