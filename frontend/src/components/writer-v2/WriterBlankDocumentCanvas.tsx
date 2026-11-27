import React from 'react';
import type { WriterDocumentMetaV2 } from '@/core/writer-v2/types';
import {
  createWriterBlankDocumentPageDescriptors,
} from '@/core/writer-v2/writerBlankDocumentLayout';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useEditorStore } from '@/core/editor/store';
import { WriterBlankPageCanvas } from './WriterBlankPageCanvas';
import { BlankDocumentPageSetupDialog } from './BlankDocumentPageSetupDialog';
import { BlankDocumentRenameDialog } from './BlankDocumentRenameDialog';

export interface WriterBlankDocumentCanvasProps {
  documentMeta?: WriterDocumentMetaV2 | null;
  scale?: number;
  showMarginGuides?: boolean;
  className?: string;
}

const pageActionBtnCls =
  'border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs px-2 py-0.5 leading-[18px] cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed';

export const WriterBlankDocumentCanvas: React.FC<WriterBlankDocumentCanvasProps> = ({
  documentMeta: documentMetaProp,
  scale = 1,
  showMarginGuides = true,
  className = '',
}) => {
  const [pageSetupOpen, setPageSetupOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const activeMode = useEditorStore((state) => state.activeMode);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);
  const activeBlankPage = useWriterV2Store((state) => state.activeBlankPage);
  const setActiveBlankPage = useWriterV2Store((state) => state.setActiveBlankPage);

  const storeDocumentMeta = useWriterV2Store((state) => state.documentMeta);
  const addBlankWriterPage = useWriterV2Store((state) => state.addBlankWriterPage);
  const duplicateBlankWriterPage = useWriterV2Store((state) => state.duplicateBlankWriterPage);
  const removeBlankWriterPage = useWriterV2Store((state) => state.deleteBlankWriterPage);
  const updateBlankWriterPageSetup = useWriterV2Store((state) => state.updateBlankWriterPageSetup);
  const renameBlankWriterDocument = useWriterV2Store((state) => state.renameBlankWriterDocument);
  const documentMeta = documentMetaProp ?? storeDocumentMeta;
  const pages = React.useMemo(
    () => createWriterBlankDocumentPageDescriptors(documentMeta),
    [documentMeta],
  );
  const pageCount = documentMeta?.mode === 'blankDocument' ? documentMeta.pageCount : 0;

  React.useEffect(() => {
    if (!containerRef.current || documentMeta?.mode !== 'blankDocument') return;
    const targetEl = containerRef.current.querySelector<HTMLElement>(
      `[data-page-index="${activeBlankPage - 1}"]`,
    );
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeBlankPage, documentMeta?.mode]);

  if (!documentMeta || documentMeta.mode !== 'blankDocument') {
    return (
      <div
        className={className}
        data-testid="writer-blank-document-empty"
      >
        No blank Writer document is active.
      </div>
    );
  }

  const showModeGuidance =
    activeMode === 'annotate' || activeMode === 'draw' || activeMode === 'organize';

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center gap-6 h-full min-h-full p-6 md:p-8 bg-slate-200 dark:bg-slate-950 overflow-auto ${className}`}
      data-testid="writer-blank-document-canvas"
      data-writer-blank-document="true"
    >
      {showModeGuidance && (
        <div
          data-testid="writer-blank-document-mode-banner"
          className="w-full max-w-2xl flex items-center justify-between gap-3 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 shadow-xs"
        >
          <span>
            Blank Canvas documents are authored in <strong>Write</strong> mode. Export to PDF from the Writer toolbar to use PDF Draw, Annotate, or Organize tools.
          </span>
          <button
            type="button"
            data-testid="writer-blank-switch-to-write-btn"
            onClick={() => setActiveMode('write')}
            className="shrink-0 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Switch to Write
          </button>
        </div>
      )}

      <div
        data-testid="writer-blank-document-title-row"
        className="flex items-center gap-2 text-slate-900 dark:text-slate-100 text-sm font-semibold select-none"
      >
        <span data-testid="writer-blank-document-title">
          {documentMeta.title ?? 'Untitled document'}
        </span>
        <button
          type="button"
          data-testid="writer-blank-document-rename-button"
          onClick={() => setRenameOpen(true)}
          className={pageActionBtnCls}
        >
          Rename
        </button>
      </div>

      <div
        data-testid="writer-blank-document-top-controls"
        className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-xs select-none"
      >
        <span>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {Math.round(documentMeta.pageSetup.width)} × {Math.round(documentMeta.pageSetup.height)} pt
        </span>
        <button
          type="button"
          data-testid="writer-blank-document-page-setup-button"
          onClick={() => setPageSetupOpen(true)}
          className={pageActionBtnCls}
        >
          Page setup
        </button>
        <button
          type="button"
          data-testid="writer-blank-document-add-page-button"
          onClick={() => addBlankWriterPage()}
          className={pageActionBtnCls}
        >
          Add page
        </button>
      </div>

      {pages.map((page) => (
        <div
          key={page.pageIndex}
          data-testid="writer-blank-document-page-frame"
          data-page-index={page.pageIndex}
          onClick={() => setActiveBlankPage(page.pageIndex + 1)}
          className="flex flex-col items-center gap-2"
        >
          <div
            data-testid="writer-blank-document-page-toolbar"
            className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 select-none"
          >
            <span data-testid="writer-blank-document-page-label">
              {page.label}
            </span>
            <button
              type="button"
              data-testid="writer-blank-document-insert-page-after-button"
              onClick={(e) => {
                e.stopPropagation();
                addBlankWriterPage(page.pageIndex);
              }}
              className={pageActionBtnCls}
            >
              Insert after
            </button>
            <button
              type="button"
              data-testid="writer-blank-document-duplicate-page-button"
              onClick={(e) => {
                e.stopPropagation();
                duplicateBlankWriterPage(page.pageIndex);
              }}
              className={pageActionBtnCls}
            >
              Duplicate
            </button>
            <button
              type="button"
              data-testid="writer-blank-document-remove-page-button"
              onClick={(e) => {
                e.stopPropagation();
                removeBlankWriterPage(page.pageIndex);
              }}
              disabled={pageCount <= 1}
              className={pageActionBtnCls}
            >
              Remove
            </button>
          </div>
          <WriterBlankPageCanvas
            pageIndex={page.pageIndex}
            documentMeta={documentMeta}
            scale={scale}
            showMarginGuides={showMarginGuides}
          />
        </div>
      ))}

      <BlankDocumentRenameDialog
        open={renameOpen}
        title={documentMeta.title ?? 'Untitled document'}
        onCancel={() => setRenameOpen(false)}
        onRename={(title) => {
          renameBlankWriterDocument(title);
          setRenameOpen(false);
        }}
      />

      <BlankDocumentPageSetupDialog
        open={pageSetupOpen}
        pageSetup={documentMeta.pageSetup}
        onCancel={() => setPageSetupOpen(false)}
        onApply={(pageSetup) => {
          updateBlankWriterPageSetup(pageSetup);
          setPageSetupOpen(false);
        }}
      />
    </div>
  );
};
