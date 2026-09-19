import React, { useEffect, useRef, useState } from 'react';
import {
  Layers,
  PlusSquare,
  RotateCw,
  Scissors,
  CopyPlus,
  Replace,
  FilePlus2,
  Trash2,
  Split,
  Undo,
  Redo,
  Hash,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
  type AdmittedDonorSet,
  type DonorCommandTarget,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type CommandResources,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { useHistoryStore } from '@/core/document-history/store';
import { useShallow } from 'zustand/react/shallow';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';
import { InsertBlankPageDialog } from '../dialogs/InsertBlankPageDialog';
import { ReplacePageDialog } from '../dialogs/ReplacePageDialog';
import { PageLabelsDialog } from '../dialogs/PageLabelsDialog';
import { HeaderFooterDialog } from '../dialogs/HeaderFooterDialog';
import type { PageLabelRange } from '@/core/pages/types';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';

export const ToolbarOrganize: React.FC = () => {
  const [isBlankPageDialogOpen, setIsBlankPageDialogOpen] = useState(false);
  const [isReplacePageDialogOpen, setIsReplacePageDialogOpen] = useState(false);
  const [isPageLabelsDialogOpen, setIsPageLabelsDialogOpen] = useState(false);
  const [isHeaderFooterDialogOpen, setIsHeaderFooterDialogOpen] = useState(false);
  const [replaceDonorSet, setReplaceDonorSet] = useState<AdmittedDonorSet | null>(null);
  const donorOperationRef = useRef<{
    controller: AbortController;
    documentKey: string;
  } | null>(null);

  const {
    workingBytes,
    documentKey,
    fileName,
    pageCount,
    selectedPageIds,
    selectedPages,
    pageGraph,
    viewState,
    setPage,
    clearSelectedPages,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    fileName: state.fileName,
    pageCount: state.pageCount,
    selectedPageIds: state.selectedPageIds,
    selectedPages: state.selectedPages,
    pageGraph: state.pageGraph,
    viewState: state.viewState,
    setPage: state.setPage,
    clearSelectedPages: state.clearSelectedPages,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const { canUndo, canRedo, peekUndo, peekRedo } = useHistoryStore(useShallow((state) => ({
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    peekUndo: state.peekUndo,
    peekRedo: state.peekRedo,
  })));

  const activePages = selectedPages.length > 0 ? selectedPages : [viewState.currentPage];
  const activeIndices = activePages.map((page) => page - 1);

  const beginDonorOperation = (expectedDocumentKey: string) => {
    donorOperationRef.current?.controller.abort('superseded by a newer donor operation');
    setIsReplacePageDialogOpen(false);
    setReplaceDonorSet(null);
    const operation = {
      controller: new AbortController(),
      documentKey: expectedDocumentKey,
    };
    donorOperationRef.current = operation;
    return operation;
  };

  const finishDonorOperation = (operation: { controller: AbortController; documentKey: string }) => {
    if (donorOperationRef.current === operation) {
      donorOperationRef.current = null;
    }
  };

  const closeReplaceDonor = () => {
    donorOperationRef.current?.controller.abort('replacement dialog closed');
    donorOperationRef.current = null;
    setIsReplacePageDialogOpen(false);
    setReplaceDonorSet(null);
  };

  useEffect(() => {
    const operation = donorOperationRef.current;
    if (operation && operation.documentKey !== documentKey) {
      operation.controller.abort('active document changed');
      donorOperationRef.current = null;
      setIsReplacePageDialogOpen(false);
      setReplaceDonorSet(null);
    }
  }, [documentKey]);

  useEffect(() => () => {
    donorOperationRef.current?.controller.abort('toolbar unmounted');
    donorOperationRef.current = null;
  }, []);

  const admitDonorSelection = async (
    multiple: boolean,
    commandTarget: DonorCommandTarget,
  ): Promise<{
    admitted: AdmittedDonorSet;
    operation: { controller: AbortController; documentKey: string };
  } | null> => {
    if (!workingBytes || !documentKey) return null;
    const expectedDocumentKey = documentKey;
    const operation = beginDonorOperation(expectedDocumentKey);

    try {
      const sources = await FileAdapter.pickPdfFileSources(multiple);
      if (sources.length === 0) {
        finishDonorOperation(operation);
        return null;
      }
      const result = await admitDonorPdfFiles(
        sources,
        'TOOLBAR_ORGANIZE',
        commandTarget,
        {
          signal: operation.controller.signal,
          ownerDocumentKey: expectedDocumentKey,
          isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
        },
      );
      if (result.outcome !== 'ACCEPTED') {
        if (result.outcome !== 'CANCELLED') {
          addToast({
            type: 'error',
            title: 'Donor PDF Rejected',
            message: firstDonorAdmissionErrorMessage(result) ?? 'The donor PDF could not be admitted.',
          });
        }
        finishDonorOperation(operation);
        return null;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: operation.controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      return { admitted: result.value, operation };
    } catch (error) {
      if (!isOperationCancelledError(error) && !operation.controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      finishDonorOperation(operation);
      return null;
    }
  };

  const runMutation = async (
    draft: PdfCommandDraft,
    successMessage: string,
    nextPage: number | null,
    options?: {
      signal?: AbortSignal;
      documentKey?: string;
      resources?: CommandResources;
      preserveSelection?: boolean;
    },
  ) => {
    const commandDocumentKey = options?.documentKey ?? documentKey;
    if (!workingBytes || !commandDocumentKey) return null;

    const result = await commandBus.execute({
      command: materializePdfCommand(
        draft,
        'toolbar',
        commandDocumentKey,
      ),
      workingBytes,
      resources: options?.resources,
      context: {
        currentPage: viewState.currentPage,
        selectedPages,
        fileName: useSessionStore.getState().fileName ?? 'document.pdf',
        documentKey: commandDocumentKey,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!result.success) {
      if (result.error?.code === 'CANCELLED') return null;
      addToast({
        type: 'error',
        title: 'Organize Action Failed',
        message: result.error?.message ?? result.message,
      });
      return null;
    }

    if (result.mutated) {
      if (!options?.preserveSelection) {
        clearSelectedPages();
      }
      if (nextPage !== null) {
        setPage(nextPage);
      }
    }

    addToast({
      type: 'success',
      title: 'Organize Action Complete',
      message: successMessage,
    });
    return result;
  };

  const handlePageLabelsApply = async (
    ranges: PageLabelRange[],
  ): Promise<boolean> => {
    if (!pageGraph) return false;

    const result = await runMutation(
      {
        type: 'SET_PAGE_LABELS',
        payload: { ranges },
      },
      ranges.length === 0
        ? 'Cleared logical page labels.'
        : 'Updated logical page labels.',
      null,
      { preserveSelection: true },
    );

    return Boolean(result);
  };

  const handleHeaderFooterApply = async (
    template: HeaderFooterTemplate,
  ): Promise<boolean> => {
    if (!pageGraph) return false;

    const result = await runMutation(
      {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: { template },
      },
      'Applied printed header/footer content.',
      null,
      { preserveSelection: true },
    );

    return Boolean(result);
  };

  const handleMerge = async () => {
    const admitted = await admitDonorSelection(true, 'MERGE_PDF');
    if (!admitted) return;
    try {
      await runMutation(
        {
          type: 'MERGE_PDF',
          payload: {
            donorResourceIds: admitted.admitted.donors.map(
              (_, index) => `donor:${index}`,
            ),
          },
        },
        `Merged ${admitted.admitted.donors.length} file(s).`,
        viewState.currentPage,
        {
          signal: admitted.operation.controller.signal,
          documentKey: admitted.operation.documentKey,
          resources: {
            donors: Object.fromEntries(
              admitted.admitted.donors.map((donor, index) => [
                `donor:${index}`,
                donor,
              ]),
            ),
          },
        },
      );
    } finally {
      finishDonorOperation(admitted.operation);
    }
  };

  const handleExtract = async () => {
    if (!workingBytes || activeIndices.length === 0) return;

    const result = await runMutation(
      {
        type: 'EXTRACT_PAGES',
        payload: {
          pageIndices: activeIndices,
          outputName: `extract-pages-${activePages.join('-')}.pdf`,
        },
      },
      `Prepared extraction for ${activePages.length} page(s).`,
      null,
    );

    if (!result || !result.artifacts || result.artifacts.length === 0) return;
    for (const artifact of result.artifacts) {
      if (artifact.kind !== 'pdf') continue;
      await FileAdapter.savePdfBytes(artifact.bytes, artifact.name, null);
    }
  };

  const handleInsertFromPdf = async () => {
    const admitted = await admitDonorSelection(false, 'INSERT_PAGES');
    if (!admitted) return;
    const donor = admitted.admitted.donors[0];
    try {
      await runMutation(
        {
          type: 'INSERT_PAGES',
          payload: {
            atIndex: viewState.currentPage - 1,
            donorResourceId: 'donor:0',
          },
        },
        `Inserted pages from ${donor.fileName}.`,
        viewState.currentPage,
        {
          signal: admitted.operation.controller.signal,
          documentKey: admitted.operation.documentKey,
          resources: {
            donors: {
              'donor:0': donor,
            },
          },
        },
      );
    } finally {
      finishDonorOperation(admitted.operation);
    }
  };

  const handleDeletePages = async () => {
    if (!workingBytes || activeIndices.length === 0) return;
    if (activeIndices.length >= pageCount) {
      addToast({
        type: 'error',
        title: 'Delete Blocked',
        message: 'Cannot remove all pages from the document.',
      });
      return;
    }

    await runMutation(
      { type: 'DELETE_PAGES', payload: { pageIndices: activeIndices } },
      `Deleted ${activePages.length} page(s).`,
      1,
    );
  };

  const handleSplitOut = async () => {
    if (!workingBytes || activeIndices.length === 0) return;

    const n = activeIndices.length;
    const confirmed = window.confirm(
      `Split will remove ${n} page${n === 1 ? '' : 's'} from this document ` +
      `and save ${n === 1 ? 'it' : 'them'} to a new PDF.\n\n` +
      `This cannot be undone. Continue?`
    );

    if (!confirmed) return;

    const result = await runMutation(
      {
        type: 'SPLIT_PAGES',
        payload: {
          pageIndices: activeIndices,
          outputName: `split-pages-${activePages.join('-')}.pdf`,
        },
      },
      `Split ${activePages.length} page(s) into a new file.`,
      1,
    );

    if (!result || !result.artifacts || result.artifacts.length === 0) return;
    for (const artifact of result.artifacts) {
      if (artifact.kind !== 'pdf') continue;
      await FileAdapter.savePdfBytes(artifact.bytes, artifact.name, null);
    }
  };

  const handleDuplicatePages = async () => {
    if (!workingBytes || activeIndices.length === 0) return;
    await runMutation(
      { type: 'DUPLICATE_PAGES', payload: { pageIndices: activeIndices } },
      `Duplicated ${activePages.length} page(s).`,
      viewState.currentPage,
    );
  };

  const handleRotatePages = async () => {
    if (!workingBytes || activeIndices.length === 0) return;
    await runMutation(
      {
        type: 'ROTATE_PAGES',
        payload: { pageIndices: activeIndices, angle: 90 },
      },
      `Rotated ${activePages.length} page(s) by 90°.`,
      viewState.currentPage,
    );
  };

  const handleInsertBlankPage = () => {
    if (!workingBytes) return;
    setIsBlankPageDialogOpen(true);
  };

  const confirmInsertBlankPage = async (preset: string, placement: string) => {
    if (!workingBytes) return;

    let size: { width: number; height: number } = { width: 595, height: 842 };
    if (preset === 'letter') {
      size = { width: 612, height: 792 };
    }
    if (preset === 'match') {
      size = await PdfEditAdapter.getPageSize(workingBytes, viewState.currentPage - 1);
    }

    const atIndex = placement === 'before' ? viewState.currentPage - 1 : viewState.currentPage;
    await runMutation(
      { type: 'INSERT_BLANK_PAGE', payload: { atIndex, size } },
      'Inserted blank page.',
      atIndex + 1,
    );
  };

  const handleReplacePage = async () => {
    const admitted = await admitDonorSelection(false, 'REPLACE_PAGE');
    if (!admitted) return;
    if (donorOperationRef.current !== admitted.operation) return;
    setReplaceDonorSet(admitted.admitted);
    setIsReplacePageDialogOpen(true);
  };

  const confirmReplacePage = async (donorPage: number) => {
    const operation = donorOperationRef.current;
    const staged = replaceDonorSet;
    const donor = staged?.donors[0];
    if (!workingBytes || !operation || !staged || !donor) return;
    const safeDonorPage = Math.max(1, Math.min(donor.pageCount, donorPage));
    try {
      assertAdmittedDonorSetDispatchAllowed(staged, {
        signal: operation.controller.signal,
        ownerDocumentKey: operation.documentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === operation.documentKey,
      });
      await runMutation(
        {
          type: 'REPLACE_PAGE',
          payload: {
            atIndex: viewState.currentPage - 1,
            donorResourceId: 'donor:0',
            donorPageIndex: safeDonorPage - 1,
          },
        },
        `Replaced current page from donor page ${safeDonorPage}.`,
        viewState.currentPage,
        {
          signal: operation.controller.signal,
          documentKey: operation.documentKey,
          resources: {
            donors: {
              'donor:0': donor,
            },
          },
        },
      );
    } catch (error) {
      if (!isOperationCancelledError(error) && !operation.controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Replacement Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      operation.controller.abort('replacement operation completed');
      finishDonorOperation(operation);
      setReplaceDonorSet(null);
      setIsReplacePageDialogOpen(false);
    }
  };

  return (
    <>
      <InsertBlankPageDialog
        isOpen={isBlankPageDialogOpen}
        onClose={() => setIsBlankPageDialogOpen(false)}
        onConfirm={confirmInsertBlankPage}
      />
      <ReplacePageDialog
        isOpen={isReplacePageDialogOpen}
        onClose={closeReplaceDonor}
        onConfirm={confirmReplacePage}
        maxPages={replaceDonorSet?.donors[0]?.pageCount ?? 1}
      />
      {pageGraph && (
        <HeaderFooterDialog
          isOpen={isHeaderFooterDialogOpen}
          pageGraph={pageGraph}
          currentPageId={viewState.currentPageId}
          selectedPageIds={selectedPageIds}
          fileName={fileName ?? 'document.pdf'}
          onClose={() => setIsHeaderFooterDialogOpen(false)}
          onApply={handleHeaderFooterApply}
        />
      )}
      {pageGraph && (
        <PageLabelsDialog
          isOpen={isPageLabelsDialogOpen}
          pageGraph={pageGraph}
          currentPageId={viewState.currentPageId}
          selectedPageIds={selectedPageIds}
          onClose={() => setIsPageLabelsDialogOpen(false)}
          onApply={handlePageLabelsApply}
        />
      )}
      <div className="flex items-center space-x-1">
        <Tooltip content={peekUndo() ? `Undo: ${peekUndo()?.label}` : "Undo"}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void applyUndo()} disabled={!canUndo() || !workingBytes}>
            <Undo className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content={peekRedo() ? `Redo: ${peekRedo()?.label}` : "Redo"}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void applyRedo()} disabled={!canRedo() || !workingBytes}>
            <Redo className="w-4 h-4" />
          </Button>
        </Tooltip>

        <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />

        <Tooltip content="Merge PDFs">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleMerge} disabled={!workingBytes}>
            <Layers className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content={activeIndices.length > 0 ? `Extract ${activeIndices.length} page(s) — copies to a new PDF, this document is unchanged` : 'Extract — select pages in the thumbnail panel first'}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExtract} disabled={!workingBytes || activeIndices.length === 0}>
            <Scissors className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Insert pages from another PDF before current page">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertFromPdf} disabled={!workingBytes}>
            <PlusSquare className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Delete selected/current pages">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDeletePages}
            disabled={!workingBytes || activeIndices.length >= pageCount}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Duplicate selected/current pages">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDuplicatePages} disabled={!workingBytes}>
            <CopyPlus className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Rotate selected/current pages">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRotatePages} disabled={!workingBytes}>
            <RotateCw className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Replace current page from another PDF">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReplacePage} disabled={!workingBytes}>
            <Replace className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Insert blank page">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertBlankPage} disabled={!workingBytes}>
            <FilePlus2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Header & Footer — visible printed content">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsHeaderFooterDialogOpen(true)}
            disabled={!workingBytes || !pageGraph}
            aria-label="Header & Footer"
          >
            <FileText className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Logical Page Labels — PDF navigator numbering, not printed page numbers">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsPageLabelsDialogOpen(true)}
            disabled={!workingBytes || !pageGraph}
            aria-label="Logical Page Labels"
          >
            <Hash className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content={activeIndices.length > 0 ? `Split ${activeIndices.length} page(s) — moves to new PDF and removes from this document` : 'Split — select pages in the thumbnail panel first'}>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950 transition-colors" onClick={handleSplitOut} disabled={!workingBytes || activeIndices.length === 0}>
            <Split className="w-4 h-4" />
          </Button>
        </Tooltip>

      </div>
    </>
  );
};
