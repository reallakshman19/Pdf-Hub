import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  MoreHorizontal,
  Stamp,
  Crop,
  Maximize2,
  GitMerge,
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
import { InsertPdfDialog } from '../dialogs/InsertPdfDialog';
import { PageLabelsDialog } from '../dialogs/PageLabelsDialog';
import { HeaderFooterDialog } from '../dialogs/HeaderFooterDialog';
import { BatesNumberingDialog } from '../dialogs/BatesNumberingDialog';
import { CropMarginsDialog } from '../dialogs/CropMarginsDialog';
import { NormalizePageSizeDialog } from '../dialogs/NormalizePageSizeDialog';
import { CollatePdfDialog } from '../dialogs/CollatePdfDialog';
import {
  consumePendingOrganizeAction,
  executeBatesNumbering,
  executeCollateWithDonor,
  executeCropPdfMargins,
  executeNormalizePageDimensions,
  peekPendingOrganizeAction,
  type OrganizeQuickAction,
} from '@/core/pdf-mutation/organizeWorkflowActions';
import type { BatesNumberingOptions } from '@/core/pdf-mutation/pdfBatesNumbering';
import type { CollationMode } from '@/core/pdf-mutation/pdfCollation';
import type { CropMarginOptions } from '@/core/pdf-mutation/pdfMarginCropping';
import type { NormalizeOptions } from '@/core/pdf-mutation/pdfNormalization';
import type { PageLabelRange } from '@/core/pages/types';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';

export type { OrganizeQuickAction };

export const ToolbarOrganize: React.FC = () => {
  const [isBlankPageDialogOpen, setIsBlankPageDialogOpen] = useState(false);
  const [isReplacePageDialogOpen, setIsReplacePageDialogOpen] = useState(false);
  const [isInsertPdfDialogOpen, setIsInsertPdfDialogOpen] = useState(false);
  const [isPageLabelsDialogOpen, setIsPageLabelsDialogOpen] = useState(false);
  const [isHeaderFooterDialogOpen, setIsHeaderFooterDialogOpen] = useState(false);
  const [isBatesDialogOpen, setIsBatesDialogOpen] = useState(false);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [isNormalizeDialogOpen, setIsNormalizeDialogOpen] = useState(false);
  const [isCollateDialogOpen, setIsCollateDialogOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [replaceDonorSet, setReplaceDonorSet] = useState<AdmittedDonorSet | null>(null);
  const [insertDonorSet, setInsertDonorSet] = useState<AdmittedDonorSet | null>(null);
  const [collateDonorSet, setCollateDonorSet] = useState<AdmittedDonorSet | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
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
    setIsInsertPdfDialogOpen(false);
    setInsertDonorSet(null);
    setIsCollateDialogOpen(false);
    setCollateDonorSet(null);
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

  const closeInsertDonor = () => {
    donorOperationRef.current?.controller.abort('insert dialog closed');
    donorOperationRef.current = null;
    setIsInsertPdfDialogOpen(false);
    setInsertDonorSet(null);
    setIsCollateDialogOpen(false);
    setCollateDonorSet(null);
  };

  const closeCollateDonor = () => {
    donorOperationRef.current?.controller.abort('collate dialog closed');
    donorOperationRef.current = null;
    setIsCollateDialogOpen(false);
    setCollateDonorSet(null);
  };

  useEffect(() => {
    const operation = donorOperationRef.current;
    if (operation && operation.documentKey !== documentKey) {
      operation.controller.abort('active document changed');
      donorOperationRef.current = null;
      setIsReplacePageDialogOpen(false);
      setReplaceDonorSet(null);
      setIsInsertPdfDialogOpen(false);
      setInsertDonorSet(null);
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
    binaryResources?: Readonly<Record<string, Uint8Array>>,
  ): Promise<boolean> => {
    if (!pageGraph) return false;

    const result = await runMutation(
      {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: { template },
      },
      'Applied printed header/footer content.',
      null,
      {
        preserveSelection: true,
        ...(binaryResources
          ? { resources: { binaries: binaryResources } }
          : {}),
      },
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
    if (donorOperationRef.current !== admitted.operation) return;
    setInsertDonorSet(admitted.admitted);
    setIsInsertPdfDialogOpen(true);
  };

  const confirmInsertPdf = async (config: {
    donorPageIndices?: number[];
    placement: 'before' | 'after';
    targetPage: number;
  }) => {
    const operation = donorOperationRef.current;
    const staged = insertDonorSet;
    const donor = staged?.donors[0];
    if (!workingBytes || !operation || !staged || !donor) return;

    const atIndex = config.placement === 'before'
      ? config.targetPage - 1
      : config.targetPage;
    const count = config.donorPageIndices?.length ?? donor.pageCount;

    try {
      assertAdmittedDonorSetDispatchAllowed(staged, {
        signal: operation.controller.signal,
        ownerDocumentKey: operation.documentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === operation.documentKey,
      });
      await runMutation(
        {
          type: 'INSERT_PAGES',
          payload: {
            atIndex,
            donorResourceId: 'donor:0',
            donorPageIndices: config.donorPageIndices,
          },
        },
        `Inserted ${count} page(s) from ${donor.fileName} ${config.placement} page ${config.targetPage}.`,
        config.targetPage,
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
    } finally {
      finishDonorOperation(operation);
      setIsInsertPdfDialogOpen(false);
      setInsertDonorSet(null);
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
      null,
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
      null,
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

  const handleCollatePdf = async () => {
    const admitted = await admitDonorSelection(false, 'INSERT_PAGES');
    if (!admitted) return;
    if (donorOperationRef.current !== admitted.operation) return;
    setCollateDonorSet(admitted.admitted);
    setIsCollateDialogOpen(true);
  };

  const confirmCollatePdf = async (config: {
    mode: CollationMode;
    donorPageIndices?: number[];
  }) => {
    const operation = donorOperationRef.current;
    const staged = collateDonorSet;
    const donor = staged?.donors[0];
    if (!workingBytes || !documentKey || !operation || !staged || !donor) return;

    try {
      assertAdmittedDonorSetDispatchAllowed(staged, {
        signal: operation.controller.signal,
        ownerDocumentKey: operation.documentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === operation.documentKey,
      });
      await executeCollateWithDonor({
        workingBytes,
        documentKey,
        donor,
        donorDocumentKey: operation.documentKey,
        config,
        signal: operation.controller.signal,
        addToast,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !operation.controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Collation Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      operation.controller.abort('collate operation completed');
      finishDonorOperation(operation);
      setCollateDonorSet(null);
      setIsCollateDialogOpen(false);
    }
  };

  const confirmBatesNumbering = async (options: BatesNumberingOptions) => {
    if (!workingBytes || !documentKey) return;
    await executeBatesNumbering({
      workingBytes,
      documentKey,
      pageCount,
      options,
      addToast,
    });
    setIsBatesDialogOpen(false);
  };

  const confirmCropMargins = async (options: CropMarginOptions) => {
    if (!workingBytes || !documentKey) return;
    await executeCropPdfMargins({
      workingBytes,
      documentKey,
      pageCount,
      options,
      addToast,
    });
    setIsCropDialogOpen(false);
  };

  const confirmNormalizeDimensions = async (options: NormalizeOptions) => {
    if (!workingBytes || !documentKey) return;
    await executeNormalizePageDimensions({
      workingBytes,
      documentKey,
      pageCount,
      options,
      addToast,
    });
    setIsNormalizeDialogOpen(false);
  };

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        moreMenuRef.current?.contains(target)
        || moreButtonRef.current?.contains(target)
      ) {
        return;
      }
      setIsMoreMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMoreMenuOpen]);

  const organizeActionRef = useRef<(action: OrganizeQuickAction) => void>(() => {});
  useEffect(() => {
    organizeActionRef.current = (action: OrganizeQuickAction) => {
      setIsMoreMenuOpen(false);
      if (!workingBytes || !documentKey) {
        addToast({
          type: 'info',
          title: 'Open a PDF First',
          message: 'Open a PDF document before running page organization tools.',
        });
        return;
      }
      if (action === 'bates') setIsBatesDialogOpen(true);
      else if (action === 'crop') setIsCropDialogOpen(true);
      else if (action === 'normalize') setIsNormalizeDialogOpen(true);
      else if (action === 'collate') void handleCollatePdf();
    };
  });

  useEffect(() => {
    const onOrganizeAction = (event: Event) => {
      const action = (event as CustomEvent<OrganizeQuickAction | undefined>).detail;
      if (!action) return;
      organizeActionRef.current(action);
    };
    document.addEventListener('pdf-hub:organize-action', onOrganizeAction);
    const pending = peekPendingOrganizeAction();
    const timer = pending
      ? window.setTimeout(() => {
          const next = consumePendingOrganizeAction();
          if (next) organizeActionRef.current(next);
        }, 0)
      : null;
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('pdf-hub:organize-action', onOrganizeAction);
    };
  }, []);

  const toggleMoreMenu = () => {
    if (isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
      return;
    }
    const rect = moreButtonRef.current?.getBoundingClientRect();
    setMoreMenuPosition(
      rect
        ? {
            top: rect.bottom + 4,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
          }
        : { top: 88, left: 16 },
    );
    setIsMoreMenuOpen(true);
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
      <InsertPdfDialog
        isOpen={isInsertPdfDialogOpen}
        donorFileName={insertDonorSet?.donors[0]?.fileName ?? ''}
        donorPageCount={insertDonorSet?.donors[0]?.pageCount ?? 1}
        currentPage={viewState.currentPage}
        totalDocumentPages={pageCount}
        initialPlacement="before"
        onClose={closeInsertDonor}
        onConfirm={confirmInsertPdf}
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
      {isBatesDialogOpen && (
        <BatesNumberingDialog
          isOpen={isBatesDialogOpen}
          totalDocumentPages={pageCount}
          selectedPages={selectedPages}
          currentPage={viewState.currentPage}
          onClose={() => setIsBatesDialogOpen(false)}
          onConfirm={confirmBatesNumbering}
        />
      )}
      {isCropDialogOpen && (
        <CropMarginsDialog
          isOpen={isCropDialogOpen}
          totalDocumentPages={pageCount}
          selectedPages={selectedPages}
          currentPage={viewState.currentPage}
          onClose={() => setIsCropDialogOpen(false)}
          onConfirm={confirmCropMargins}
        />
      )}
      {isNormalizeDialogOpen && (
        <NormalizePageSizeDialog
          isOpen={isNormalizeDialogOpen}
          totalDocumentPages={pageCount}
          selectedPages={selectedPages}
          currentPage={viewState.currentPage}
          onClose={() => setIsNormalizeDialogOpen(false)}
          onConfirm={confirmNormalizeDimensions}
        />
      )}
      {isCollateDialogOpen && collateDonorSet?.donors[0] && (
        <CollatePdfDialog
          isOpen={isCollateDialogOpen}
          primaryFileName={fileName ?? 'document.pdf'}
          primaryPageCount={pageCount}
          donorFileName={collateDonorSet.donors[0].fileName}
          donorPageCount={collateDonorSet.donors[0].pageCount}
          onClose={closeCollateDonor}
          onConfirm={confirmCollatePdf}
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
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Extract selected or current pages" onClick={handleExtract} disabled={!workingBytes || activeIndices.length === 0}>
            <Scissors className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Insert pages from another PDF">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertFromPdf} disabled={!workingBytes}>
            <PlusSquare className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Delete selected/current pages">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete selected or current pages"
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
          <Button variant="ghost" size="icon" aria-label="Rotate selected or current pages" className="h-8 w-8" onClick={handleRotatePages} disabled={!workingBytes}>
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

        <Tooltip content="More organize tools (Bates, Crop, Normalize, Collate)">
          <Button
            ref={moreButtonRef}
            variant="ghost"
            size="icon"
            aria-label="More organize tools"
            aria-haspopup="menu"
            aria-expanded={isMoreMenuOpen}
            data-testid="toolbar-organize-more-btn"
            className="h-8 w-8"
            onClick={toggleMoreMenu}
            disabled={!workingBytes}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </Tooltip>

      </div>

      {isMoreMenuOpen && moreMenuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={moreMenuRef}
              role="menu"
              aria-label="More organize tools"
              data-testid="toolbar-organize-more-menu"
              style={{
                position: 'fixed',
                top: moreMenuPosition.top,
                left: moreMenuPosition.left,
                zIndex: 70,
              }}
              className="w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs"
            >
              <button
                type="button"
                role="menuitem"
                data-testid="organize-menu-bates"
                onClick={() => organizeActionRef.current('bates')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent border-none cursor-pointer"
              >
                <Stamp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Bates Numbering…</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="organize-menu-crop"
                onClick={() => organizeActionRef.current('crop')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent border-none cursor-pointer"
              >
                <Crop className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Crop Margins…</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="organize-menu-normalize"
                onClick={() => organizeActionRef.current('normalize')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent border-none cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Normalize Page Size…</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="organize-menu-collate"
                onClick={() => organizeActionRef.current('collate')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent border-none cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Collate with PDF…</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
