import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  evaluateExistingTextUiCapability,
  type ExistingTextUiCapability,
} from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  buildExistingTextPageInspection,
  createExistingTextDeleteIntent,
} from '@/core/existing-text/model';
import type { ExistingTextSpan } from '@/core/existing-text/types';
import {
  findParagraphForSpan,
} from '@/core/existing-text/paragraphClusterer';
import {
  detectTableGridsForPage,
  findTableCellForSpan,
} from '@/core/existing-text/tableCellDetector';
import type {
  DetectedTableCell,
  DetectedTableGrid,
} from '@/core/existing-text/tableCellTypes';
import { reflowParagraphText } from '@/core/existing-text/paragraphReflowEngine';
import type { ExistingTextParagraphBlock } from '@/core/existing-text/paragraphTypes';
import {
  snapRotationDegrees,
} from '@/core/existing-text/rotatedTextGeometry';
import { detectMultiColumnLayoutFromSpans } from '@/core/existing-text/columnFlowDetector';
import { reflowTextAcrossColumns } from '@/core/existing-text/multiColumnReflowEngine';
import type { MultiColumnLayout } from '@/core/existing-text/columnFlowTypes';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useToastStore } from '@/core/toast/store';

export interface InlineExistingTextEditorProps {
  pageNumber: number;
  pageId: string;
  sourceIndex: number;
  initialText: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize: number;
    rotationDegrees?: number;
  };
  workingBytes: Uint8Array | null;
  documentKey: string | null;
  onCommitSuccess: () => void;
  onCancel: () => void;
  onNavigateToSpan?: (span: ExistingTextSpan) => void;
}

export const InlineExistingTextEditor: React.FC<InlineExistingTextEditorProps> = ({
  pageNumber,
  pageId,
  sourceIndex,
  initialText,
  bounds,
  workingBytes,
  documentKey,
  onCommitSuccess,
  onCancel,
  onNavigateToSpan,
}) => {
  const [text, setText] = useState(initialText);
  const [fontSize, setFontSize] = useState<number>(bounds.fontSize);
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [textColor, setTextColor] = useState<string | null>(null);
  const [align, setAlign] = useState<import('@/core/existing-text/alignmentTypes').ExistingTextAlign>('left');
  const [span, setSpan] = useState<ExistingTextSpan | null>(null);
  const [pageSpans, setPageSpans] = useState<readonly ExistingTextSpan[]>([]);
  const [paragraph, setParagraph] = useState<ExistingTextParagraphBlock | null>(null);
  const [tableCell, setTableCell] = useState<DetectedTableCell | null>(null);
  const [tableGrids, setTableGrids] = useState<readonly DetectedTableGrid[]>([]);
  const [multiColumnLayout, setMultiColumnLayout] = useState<MultiColumnLayout | null>(null);
  const [isParagraphMode, setIsParagraphMode] = useState<boolean>(false);
  const [capability, setCapability] = useState<ExistingTextUiCapability | null>(null);
  const [checking, setChecking] = useState(false);
  const [committing, setCommitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const addToast = useToastStore((state) => state.addToast);

  const isOvercapacity = useMemo(() => {
    if (!multiColumnLayout) return false;
    const reflow = reflowTextAcrossColumns(text, multiColumnLayout, { fontSizePt: fontSize });
    return reflow.overflowsEntireLayout;
  }, [text, multiColumnLayout, fontSize]);

  const hasStyleChange =
    Math.abs(fontSize - bounds.fontSize) > 0.1 ||
    isBold ||
    isItalic ||
    textColor !== null ||
    align !== 'left';

  const styleOverride = React.useMemo<import('@/core/existing-text/types').ExistingTextStyleOverride | undefined>(() => {
    if (!hasStyleChange) return undefined;
    return {
      fontSizePt: Math.abs(fontSize - bounds.fontSize) > 0.1 ? fontSize : undefined,
      bold: isBold ? true : undefined,
      italic: isItalic ? true : undefined,
      colorHex: textColor ?? undefined,
      align: align !== 'left' ? align : undefined,
    };
  }, [hasStyleChange, fontSize, bounds.fontSize, isBold, isItalic, textColor, align]);

  const isDirty = isParagraphMode
    ? text !== (paragraph?.fullText ?? initialText) || hasStyleChange
    : text !== initialText || hasStyleChange;

  const paragraphReflow = useMemo(() => {
    if (!isParagraphMode || !paragraph) return null;
    return reflowParagraphText(paragraph, text, {
      fontSizePt: styleOverride?.fontSizePt,
    });
  }, [isParagraphMode, paragraph, text, styleOverride]);

  // 1. Resolve domain ExistingTextSpan from page items
  useEffect(() => {
    let active = true;
    const resolveSpan = async () => {
      if (!workingBytes || !documentKey) return;
      try {
        const lease = await PdfRendererAdapter.acquireDocument(workingBytes);
        try {
          const page = await lease.doc.getPage(pageNumber);
          try {
            const items = await PdfRendererAdapter.getPageExistingTextSourceItems(page);
            if (!active) return;
            const pageInspection = buildExistingTextPageInspection(
              {
                revisionId: documentKey,
                pageId,
                pageIndex: pageNumber - 1,
              },
              items,
            );
            const matched = pageInspection.spans.find((s) => s.sourceIndex === sourceIndex);
            if (matched && active) {
              setSpan(matched);
              setPageSpans(pageInspection.spans);
              const p = findParagraphForSpan(matched, pageInspection.spans);
              setParagraph(p);

              const grids = detectTableGridsForPage(pageInspection.spans);
              setTableGrids(grids);
              const cell = findTableCellForSpan(matched, grids);
              if (cell) {
                setTableCell(cell);
                if (cell.suggestedAlignment && cell.suggestedAlignment !== 'left') {
                  setAlign(cell.suggestedAlignment);
                }
              }

              const mc = detectMultiColumnLayoutFromSpans(pageInspection.spans, pageNumber - 1, pageId);
              setMultiColumnLayout(mc);
            }
          } finally {
            page.cleanup();
          }
        } finally {
          await lease.release();
        }
      } catch {
        // Fallback or cancelled
      }
    };

    void resolveSpan();
    return () => {
      active = false;
    };
  }, [workingBytes, documentKey, pageNumber, pageId, sourceIndex]);

  // 2. Select text and focus input on mount or mode change
  useEffect(() => {
    if (isParagraphMode && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    } else if (!isParagraphMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isParagraphMode]);

  const handleToggleParagraphMode = () => {
    if (!isParagraphMode) {
      if (span) {
        const p = paragraph ?? findParagraphForSpan(span, pageSpans.length > 0 ? pageSpans : [span]);
        setParagraph(p);
        setText(p.fullText);
      }
      setIsParagraphMode(true);
    } else {
      setIsParagraphMode(false);
      setText(initialText);
    }
  };

  // 3. Debounced capability evaluation on text or style change (single span mode)
  useEffect(() => {
    if (isParagraphMode || !span || !workingBytes || !documentKey || !isDirty) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const cap = await evaluateExistingTextUiCapability({
          pdfBytes: workingBytes,
          currentRevisionId: documentKey,
          span,
          replacementText: text,
          styleOverride,
          signal: controller.signal,
        });
        setCapability(cap);
      } catch {
        // cancelled or error
      } finally {
        setChecking(false);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, span, workingBytes, documentKey, isDirty, styleOverride, isParagraphMode]);

  const effectiveCapability = isDirty ? capability : null;

  // 4. Delete action
  const handleDeleteText = async () => {
    if (!workingBytes || !documentKey || !span || committing) {
      return;
    }

    setCommitting(true);
    try {
      const deleteIntent = createExistingTextDeleteIntent(span, 'auto');
      const result = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'DELETE_EXISTING_TEXT',
            payload: {
              schemaVersion: 1,
              span,
              intent: deleteIntent,
              provenance: effectiveCapability?.provenance,
              strategy: 'auto',
            },
          },
          'toolbar',
          documentKey,
        ),
      });

      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Text deletion failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Text deleted',
        message: result.message,
      });
      onCommitSuccess();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Text deletion failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCommitting(false);
    }
  };

  // 5. Commit action
  const handleCommit = async () => {
    if (!isDirty) {
      onCancel();
      return;
    }
    if (!workingBytes || !documentKey || !span) {
      return;
    }

    if (text.trim() === '' && !isParagraphMode && !tableCell) {
      await handleDeleteText();
      return;
    }

    // OCR-synthesized candidate path
    if (span.id.startsWith('ocr-span-')) {
      setCommitting(true);
      try {
        const result = await commandBus.execute({
          workingBytes,
          command: materializePdfCommand(
            {
              type: 'CONVERT_OCR_TO_NATIVE_TEXT',
              payload: {
                schemaVersion: 1,
                pageIndex: span.pageIndex,
                pageId,
                intent: {
                  schemaVersion: 1,
                  sourceRevisionId: documentKey,
                  pageIndex: span.pageIndex,
                  pageId,
                  ocrBlockId: span.id.replace('ocr-span-', ''),
                  ocrLineIndices: [span.sourceIndex],
                  originalOcrText: initialText,
                  editedText: text,
                  targetBoundsPt: {
                    x: span.originPt.x,
                    y: span.originPt.y,
                    width: span.advanceWidthPt,
                    height: span.sourceHeightPt,
                  },
                  fontSizePt: fontSize,
                  fontFamily: 'Helvetica',
                  colorHex: textColor ?? '#000000',
                  backgroundColorHex: '#ffffff',
                },
              },
            },
            'toolbar',
            documentKey,
          ),
        });

        if (!result.success) {
          addToast({
            type: 'error',
            title: 'OCR reconciliation failed',
            message: result.error?.message ?? result.message,
          });
          return;
        }

        addToast({
          type: 'success',
          title: 'OCR text converted',
          message: 'Converted OCR text to native vector PDF text.',
        });
        onCommitSuccess();
        return;
      } catch (err) {
        addToast({
          type: 'error',
          title: 'OCR reconciliation failed',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      } finally {
        setCommitting(false);
      }
    }

    // Paragraph reflow mutation path
    if (isParagraphMode && paragraph) {
      setCommitting(true);
      try {
        const result = await commandBus.execute({
          workingBytes,
          command: materializePdfCommand(
            {
              type: 'REPLACE_EXISTING_PARAGRAPH',
              payload: {
                schemaVersion: 1,
                paragraph,
                intent: {
                  schemaVersion: 1,
                  paragraphId: paragraph.paragraphId,
                  pageIndex: paragraph.pageIndex,
                  originalText: paragraph.fullText,
                  replacementText: text,
                  styleOverride,
                },
              },
            },
            'toolbar',
            documentKey,
          ),
        });

        if (!result.success) {
          addToast({
            type: 'error',
            title: 'Paragraph edit failed',
            message: result.error?.message ?? result.message,
          });
          return;
        }

        addToast({
          type: 'success',
          title: 'Paragraph reflowed and replaced',
          message: result.message,
        });
        onCommitSuccess();
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Paragraph edit failed',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setCommitting(false);
      }
      return;
    }

    // Table cell mutation path
    if (tableCell) {
      setCommitting(true);
      try {
        const result = await commandBus.execute({
          workingBytes,
          command: materializePdfCommand(
            {
              type: 'EDIT_TABLE_CELL_TEXT',
              payload: {
                schemaVersion: 1,
                pageId,
                cell: tableCell,
                span,
                replacementText: text,
                alignment: align,
                styleOverride,
              },
            },
            'toolbar',
            documentKey,
          ),
        });

        if (!result.success) {
          addToast({
            type: 'error',
            title: 'Table cell edit failed',
            message: result.error?.message ?? result.message,
          });
          return;
        }

        addToast({
          type: 'success',
          title: 'Table cell updated',
          message: result.message,
        });
        onCommitSuccess();
      } catch (error) {
        addToast({
          type: 'error',
          title: 'Table cell edit failed',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setCommitting(false);
      }
      return;
    }

    // Single-span mutation path
    if (!effectiveCapability) {
      return;
    }
    if (effectiveCapability.status !== 'native' && effectiveCapability.status !== 'fallback-proved') {
      return;
    }

    setCommitting(true);
    try {
      const isNative = effectiveCapability.status === 'native';
      const commandType = isNative ? 'REPLACE_EXISTING_TEXT' : 'RECONSTRUCT_EXISTING_TEXT';

      const result = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: commandType,
            payload: {
              schemaVersion: 1,
              span,
              intent: effectiveCapability.intent,
              provenance: effectiveCapability.provenance,
            },
          },
          'toolbar',
          documentKey,
        ),
      });

      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Text edit failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: isNative ? 'Text replaced natively' : 'Text reconstructed',
        message: result.message,
      });
      onCommitSuccess();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Text edit failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCommitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' && tableCell && tableGrids.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      const currentGrid = tableGrids.find((g) => g.tableId === tableCell.tableId);
      if (currentGrid && onNavigateToSpan) {
        const nextCol = event.shiftKey ? tableCell.columnIndex - 1 : tableCell.columnIndex + 1;
        let targetRow = tableCell.rowIndex;
        let targetCol = nextCol;

        if (targetCol >= currentGrid.colCount) {
          targetCol = 0;
          targetRow = (targetRow + 1) % currentGrid.rowCount;
        } else if (targetCol < 0) {
          targetCol = currentGrid.colCount - 1;
          targetRow = (targetRow - 1 + currentGrid.rowCount) % currentGrid.rowCount;
        }

        const targetCell = currentGrid.cells.find(
          (c) => c.rowIndex === targetRow && c.columnIndex === targetCol,
        );
        if (targetCell && targetCell.spanIds.length > 0) {
          const targetSpan = pageSpans.find((s) => s.id === targetCell.spanIds[0]);
          if (targetSpan) {
            void handleCommit().then(() => {
              onNavigateToSpan(targetSpan);
            });
            return;
          }
        }
      }
      void handleCommit();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      void handleCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      void handleCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const minWidth = Math.max(bounds.width + 12, 80);
  const height = Math.max(bounds.height + 6, 24);
  const isNearTop = bounds.top < 32;

  const rotationDegrees = snapRotationDegrees(span?.rotationDegrees ?? bounds.rotationDegrees ?? 0);
  const isRotated = Math.abs(rotationDegrees) > 0.5 && Math.abs(rotationDegrees - 360) > 0.5;

  const editorWidth = isParagraphMode && paragraph
    ? Math.max(minWidth, paragraph.columnWidthPt + 16)
    : minWidth;
  const editorHeight = isParagraphMode && paragraph
    ? Math.max(height * 2, paragraph.boundsPt.height + 24, 70)
    : height;

  return (
    <div
      data-testid="inline-existing-text-editor"
      className={`absolute z-30 ${tableCell ? 'ring-1 ring-dashed ring-indigo-500/80 rounded' : ''}`}
      style={{
        left: isRotated ? bounds.left : bounds.left - 4,
        top: isRotated ? bounds.top : bounds.top - 3,
        width: editorWidth,
        height: editorHeight,
        transform: isRotated ? `rotate(${-rotationDegrees}deg)` : undefined,
        transformOrigin: isRotated ? '0% 0%' : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Floating Style Controls Strip */}
      <div
        data-testid="inline-format-strip"
        className={`absolute ${isNearTop ? 'top-full mt-1' : '-top-7'} left-0 flex items-center gap-1 rounded bg-slate-900/90 px-1.5 py-0.5 text-white shadow-md backdrop-blur text-[11px] select-none pointer-events-auto`}
        style={{
          zIndex: 50,
          transform: isRotated ? `rotate(${rotationDegrees}deg)` : undefined,
          transformOrigin: isRotated ? '0% 0%' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          data-testid="inline-paragraph-mode-toggle"
          title={isParagraphMode ? 'Switch to single-line mode' : 'Switch to paragraph reflow mode'}
          className={`h-5 px-1.5 rounded flex items-center justify-center font-serif text-xs transition-colors ${
            isParagraphMode ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={handleToggleParagraphMode}
        >
          ¶
        </button>
        {isParagraphMode && (
          <button
            type="button"
            data-testid="inline-commit-button"
            title="Commit Paragraph (Ctrl+Enter)"
            className="h-5 px-1.5 rounded flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
            onClick={() => void handleCommit()}
            disabled={committing}
          >
            ✓
          </button>
        )}
        <span className="mx-0.5 h-3 w-px bg-slate-700" />
        <button
          type="button"
          data-testid="inline-bold-toggle"
          title="Bold"
          className={`h-5 w-5 rounded font-bold flex items-center justify-center transition-colors ${
            isBold ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={() => setIsBold(!isBold)}
        >
          B
        </button>
        <button
          type="button"
          data-testid="inline-italic-toggle"
          title="Italic"
          className={`h-5 w-5 rounded italic flex items-center justify-center transition-colors ${
            isItalic ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={() => setIsItalic(!isItalic)}
        >
          I
        </button>
        <span className="mx-0.5 h-3 w-px bg-slate-700" />
        <button
          type="button"
          data-testid="inline-size-minus"
          title="Decrease font size"
          className="h-5 w-5 rounded flex items-center justify-center hover:bg-slate-700 text-slate-300"
          onClick={() => setFontSize((s) => Math.max(6, Math.round(s - 1)))}
        >
          -
        </button>
        <span className="min-w-[28px] text-center font-mono text-[10px] text-slate-200">
          {fontSize.toFixed(0)}pt
        </span>
        <button
          type="button"
          data-testid="inline-size-plus"
          title="Increase font size"
          className="h-5 w-5 rounded flex items-center justify-center hover:bg-slate-700 text-slate-300"
          onClick={() => setFontSize((s) => Math.min(72, Math.round(s + 1)))}
        >
          +
        </button>
        <span className="mx-0.5 h-3 w-px bg-slate-700" />
        <button
          type="button"
          data-testid="inline-color-black"
          title="Black text"
          className={`h-3.5 w-3.5 rounded-full border transition-transform ${
            textColor === '#000000' || textColor === '#111827' ? 'border-white scale-110 ring-1 ring-white/50' : 'border-slate-500'
          } bg-[#000000]`}
          onClick={() => setTextColor((c) => (c === '#000000' ? null : '#000000'))}
        />
        <button
          type="button"
          data-testid="inline-color-blue"
          title="Blue text"
          className={`h-3.5 w-3.5 rounded-full border transition-transform ${
            textColor === '#2563eb' ? 'border-white scale-110 ring-1 ring-white/50' : 'border-slate-500'
          } bg-[#2563eb]`}
          onClick={() => setTextColor((c) => (c === '#2563eb' ? null : '#2563eb'))}
        />
        <button
          type="button"
          data-testid="inline-color-red"
          title="Red text"
          className={`h-3.5 w-3.5 rounded-full border transition-transform ${
            textColor === '#dc2626' ? 'border-white scale-110 ring-1 ring-white/50' : 'border-slate-500'
          } bg-[#dc2626]`}
          onClick={() => setTextColor((c) => (c === '#dc2626' ? null : '#dc2626'))}
        />
        <span className="mx-0.5 h-3 w-px bg-slate-700" />
        <button
          type="button"
          data-testid="inline-align-left"
          title="Align Left"
          className={`h-5 w-5 rounded flex items-center justify-center font-mono text-[10px] transition-colors ${
            align === 'left' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={() => setAlign('left')}
        >
          L
        </button>
        <button
          type="button"
          data-testid="inline-align-center"
          title="Align Center"
          className={`h-5 w-5 rounded flex items-center justify-center font-mono text-[10px] transition-colors ${
            align === 'center' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={() => setAlign('center')}
        >
          C
        </button>
        <button
          type="button"
          data-testid="inline-align-right"
          title="Align Right"
          className={`h-5 w-5 rounded flex items-center justify-center font-mono text-[10px] transition-colors ${
            align === 'right' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
          }`}
          onClick={() => setAlign('right')}
        >
          R
        </button>
        {isParagraphMode && (
          <button
            type="button"
            data-testid="inline-align-justify"
            title="Justify Paragraph"
            className={`h-5 w-5 rounded flex items-center justify-center font-mono text-[10px] transition-colors ${
              align === 'justify' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
            }`}
            onClick={() => setAlign('justify')}
          >
            J
          </button>
        )}
        {tableCell && (
          <>
            <span className="mx-0.5 h-3 w-px bg-slate-700" />
            <span
              data-testid="inline-table-cell-indicator"
              className="h-5 px-1.5 rounded flex items-center justify-center font-mono text-[10px] bg-indigo-900/80 text-indigo-200 border border-indigo-700/50"
              title={`Table Cell Row ${tableCell.rowIndex + 1}, Column ${tableCell.columnIndex + 1}`}
            >
              R{tableCell.rowIndex + 1}:C{tableCell.columnIndex + 1}
            </span>
          </>
        )}
        {isRotated && (
          <>
            <span className="mx-0.5 h-3 w-px bg-slate-700" />
            <span
              data-testid="inline-rotation-indicator"
              className="h-5 px-1.5 rounded flex items-center justify-center font-mono text-[10px] bg-amber-900/80 text-amber-200 border border-amber-700/50"
              title={`Rotated Text: ${rotationDegrees}°`}
            >
              ⟳ {rotationDegrees}°
            </span>
          </>
        )}
        {isOvercapacity && (
          <>
            <span className="mx-0.5 h-3 w-px bg-slate-700" />
            <span
              data-testid="overcapacity-warning-badge"
              className="h-5 px-1.5 rounded flex items-center justify-center font-sans text-[10px] bg-amber-500 text-amber-950 font-bold border border-amber-600 animate-pulse"
              title="Text exceeds total column layout capacity"
            >
              ⚠️ Overcapacity
            </span>
          </>
        )}
        <span className="mx-0.5 h-3 w-px bg-slate-700" />
        <button
          type="button"
          data-testid="inline-delete-text-btn"
          title="Delete Text"
          className="h-5 w-5 rounded flex items-center justify-center hover:bg-red-700/80 text-red-300 transition-colors"
          onClick={() => void handleDeleteText()}
          disabled={committing}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {isParagraphMode ? (
        <textarea
          ref={textareaRef}
          data-testid="inline-existing-text-textarea"
          className={`h-full w-full rounded border-2 border-blue-500 bg-white p-1.5 font-sans shadow-md outline-none resize-none dark:border-blue-400 dark:bg-slate-900 dark:text-slate-100 ${
            isBold ? 'font-bold' : ''
          } ${isItalic ? 'italic' : ''}`}
          style={{
            fontSize: Math.max(fontSize, 11),
            lineHeight: `${Math.max(fontSize * 1.3, 14)}px`,
            color: textColor ?? undefined,
            textAlign: align === 'justify' ? 'justify' : align,
          }}
          value={text}
          disabled={committing}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
        />
      ) : (
        <input
          ref={inputRef}
          data-testid="inline-existing-text-input"
          type="text"
          className={`h-full w-full rounded border-2 border-blue-500 bg-white px-1.5 font-sans shadow-md outline-none dark:border-blue-400 dark:bg-slate-900 dark:text-slate-100 ${
            isBold ? 'font-bold' : ''
          } ${isItalic ? 'italic' : ''}`}
          style={{
            fontSize: Math.max(fontSize, 11),
            lineHeight: `${height}px`,
            color: textColor ?? undefined,
            textAlign: align === 'justify' ? 'left' : align,
          }}
          value={text}
          disabled={committing}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!isDirty) {
              onCancel();
            }
          }}
        />
      )}

      {/* Live Badge Feedback */}
      {isDirty && (
        <div
          data-testid="inline-existing-text-badge"
          className={`absolute left-0 ${isNearTop ? 'top-full mt-8' : 'top-full mt-1'} flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium shadow-lg`}
          style={{
            zIndex: 40,
          }}
        >
          {isParagraphMode ? (
            paragraphReflow ? (
              <div className="flex items-center gap-1 rounded bg-emerald-600 text-white px-2 py-0.5">
                <CheckCircle2 className="h-3 w-3" />
                <span>
                  Paragraph reflow ({paragraphReflow.lines.length}{' '}
                  {paragraphReflow.lines.length === 1 ? 'line' : 'lines'})
                </span>
                <kbd className="ml-1 rounded bg-emerald-800/80 px-1 text-[9px] font-mono">Ctrl+↵ Enter</kbd>
              </div>
            ) : null
          ) : checking ? (
            <div className="flex items-center gap-1 rounded bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-2 py-0.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Checking fit…</span>
            </div>
          ) : effectiveCapability?.status === 'native' ? (
            <div className="flex items-center gap-1 rounded bg-emerald-600 text-white px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" />
              <span>Fits ({effectiveCapability.nativeFit.projectedReplacementAdvancePt.toFixed(1)}pt)</span>
              <kbd className="ml-1 rounded bg-emerald-800/80 px-1 text-[9px] font-mono">↵ Enter</kbd>
            </div>
          ) : effectiveCapability?.status === 'fallback-proved' ? (
            <div className="flex items-center gap-1 rounded bg-amber-600 text-white px-2 py-0.5">
              <ShieldCheck className="h-3 w-3" />
              <span>
                {effectiveCapability.fallbackReason === 'SUBSET_GLYPH_SUBSTITUTION'
                  ? `Subset fallback: ${effectiveCapability.substituteFontName ?? 'Helvetica'} (proved)`
                  : effectiveCapability.fallbackReason === 'STYLE_OVERRIDE'
                  ? 'Style override (clearance proved)'
                  : 'Overflows (clearance proved)'}
              </span>
              <kbd className="ml-1 rounded bg-amber-800/80 px-1 text-[9px] font-mono">↵ Enter</kbd>
            </div>
          ) : effectiveCapability?.status === 'unavailable' ? (
            <div className="flex items-center gap-1 rounded bg-rose-600 text-white px-2 py-0.5">
              <AlertTriangle className="h-3 w-3" />
              <span>
                {effectiveCapability.nativeFit?.status === 'unmeasurable' &&
                effectiveCapability.nativeFit.reason === 'MISSING_SUBSET_GLYPHS' &&
                effectiveCapability.nativeFit.missingCharacters &&
                effectiveCapability.nativeFit.missingCharacters.length > 0
                  ? `Missing glyph: ${effectiveCapability.nativeFit.missingCharacters.join(', ')}`
                  : 'Cannot replace natively'}
              </span>
              <kbd className="ml-1 rounded bg-rose-800/80 px-1 text-[9px] font-mono">Esc to cancel</kbd>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
