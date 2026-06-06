/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import {
  Check,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { WriterTableData } from '@/core/writer-v2/types';
import type { OcrTableBlock } from '@/core/ocr/types';
import {
  createOcrTableReviewModel,
  getLowConfidenceOcrTableCells,
  ocrTableReviewModelToWriterTableData,
  renameOcrTableReviewColumn,
  setOcrTableReviewHeaderMode,
  updateOcrTableReviewCellText,
  type OcrTableReviewModel,
} from '@/core/ocr/ocrTableReviewModel';

export interface OcrTableReviewPanelProps {
  tableBlock: OcrTableBlock | null;
  onAcceptTable?: (tableData: WriterTableData, model: OcrTableReviewModel) => void;
}

export const OcrTableReviewPanel: React.FC<OcrTableReviewPanelProps> = ({
  tableBlock,
  onAcceptTable,
}) => {
  const [model, setModel] = React.useState<OcrTableReviewModel | null>(null);

  React.useEffect(() => {
    if (!tableBlock) {
      setModel(null);
      return;
    }

    setModel(
      createOcrTableReviewModel(tableBlock, {
        useFirstRowAsHeader: true,
      }),
    );
  }, [tableBlock]);

  if (!tableBlock || !model) {
    return (
      <div
        className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
        data-testid="ocr-table-review-empty"
      >
        No OCR table selected for review.
      </div>
    );
  }

  const lowConfidenceCells = getLowConfidenceOcrTableCells(model);

  const acceptTable = () => {
    onAcceptTable?.(
      ocrTableReviewModelToWriterTableData(model),
      model,
    );
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-table-review-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-blue-600" />
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              OCR Table Review
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Review and correct OCR table cells before creating a Writer table.
            </p>
          </div>
        </div>

        <span
          className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          data-testid="ocr-table-low-confidence-count"
        >
          {lowConfidenceCells.length} low
        </span>
      </div>

      <label className="mb-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={model.hasHeaderRow}
          data-testid="ocr-table-has-header"
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setModel((current) =>
              current
                ? setOcrTableReviewHeaderMode(
                    current,
                    checked,
                  )
                : current,
            );
          }}
        />
        Use column labels as table header
      </label>

      <div className="max-h-72 overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[420px] border-collapse text-xs">
          <thead>
            <tr>
              {model.columns.map((column, columnIndex) => (
                <th
                  key={column.id}
                  className="border-b border-r border-slate-200 bg-slate-50 p-1 text-left font-medium dark:border-slate-800 dark:bg-slate-900"
                >
                  <input
                    className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    value={column.label}
                    data-testid="ocr-table-column-label"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setModel((current) =>
                        current
                          ? renameOcrTableReviewColumn(current, {
                              columnIndex,
                              label: value,
                            })
                          : current,
                      );
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {model.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell) => {
                  const lowConfidence = cell.confidence < 0.7;

                  return (
                    <td
                      key={cell.id}
                      className={[
                        'border-b border-r p-1 align-top dark:border-slate-800',
                        lowConfidence
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'bg-white dark:bg-slate-950',
                      ].join(' ')}
                      data-testid="ocr-table-cell"
                      data-low-confidence={lowConfidence ? 'true' : 'false'}
                    >
                      <textarea
                        className="min-h-12 w-full resize-y rounded border border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        value={cell.text}
                        data-testid="ocr-table-cell-input"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setModel((current) =>
                            current
                              ? updateOcrTableReviewCellText(current, {
                                  rowIndex: cell.rowIndex,
                                  columnIndex: cell.columnIndex,
                                  text: value,
                                })
                              : current,
                          );
                        }}
                      />

                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          {Math.round(cell.confidence * 100)}%
                        </span>
                        {cell.edited ? (
                          <span className="font-medium text-blue-600">
                            edited
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          {model.rows.length} rows × {model.columns.length} columns
        </div>

        <Button
          type="button"
          size="sm"
          onClick={acceptTable}
          data-testid="ocr-table-accept"
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          Accept table
        </Button>
      </div>
    </div>
  );
};
