import React, { useEffect, useRef } from 'react';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
  inspectAdmittedDonorPdfs,
  type AdmittedDonorPdf,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type CommandResources,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { ReplacePageDialog } from '@/components/dialogs/ReplacePageDialog';
import { InsertPdfDialog } from '@/components/dialogs/InsertPdfDialog';
import { ExtractPagesDialog } from '@/components/dialogs/ExtractPagesDialog';
import { PageLabelsDialog } from '@/components/dialogs/PageLabelsDialog';
import { CollatePdfDialog } from '@/components/dialogs/CollatePdfDialog';
import { NormalizePageSizeDialog } from '@/components/dialogs/NormalizePageSizeDialog';
import {
  ThumbnailMacroConfigDialog,
  type ThumbnailMacroKind,
} from './ThumbnailMacroConfigDialog';
import { collatePdfDocuments } from '@/core/pdf-mutation/pdfCollation';
import { normalizePdfPageDimensions, type NormalizeOptions } from '@/core/pdf-mutation/pdfNormalization';

interface ThumbnailContextMenuProps {
  x: number;
  y: number;
  page: number;
  selectedPages: number[];
  onClose: () => void;
  onOpenMacros?: () => void;
}

export const ThumbnailContextMenu: React.FC<ThumbnailContextMenuProps> = ({
  x,
  y,
  page,
  selectedPages,
  onClose,
  onOpenMacros,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const donorOperationRef = useRef<AbortController | null>(null);
  const {
    workingBytes,
    documentKey,
    fileName,
    viewState,
    pageGraph,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    fileName: state.fileName,
    viewState: state.viewState,
    pageGraph: state.pageGraph,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const targetPages = selectedPages.includes(page) ? selectedPages : [page];
  const pageIndices = targetPages.map((value) => value - 1);
  const pageIds = targetPages.flatMap((pageNumber) => {
    const pageId = pageGraph?.pages[pageNumber - 1]?.pageId;
    return pageId ? [pageId] : [];
  });
  const [configKind, setConfigKind] = React.useState<ThumbnailMacroKind | null>(null);
  const [stagedReplace, setStagedReplace] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
  } | null>(null);
  const [stagedMultiReplace, setStagedMultiReplace] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
    selectedPages: number[];
  } | null>(null);
  const [stagedInsert, setStagedInsert] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
    initialPlacement: 'before' | 'after';
  } | null>(null);
  const [stagedCollate, setStagedCollate] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
  } | null>(null);
  const [isNormalizeOpen, setIsNormalizeOpen] = React.useState(false);
  const [extractDialogState, setExtractDialogState] = React.useState<{
    isOpen: boolean;
    initialMode: 'extract' | 'split';
  } | null>(null);
  const [isPageLabelsOpen, setIsPageLabelsOpen] = React.useState(false);

  useEffect(() => {
    // While any dialog is open it owns outside-click / Escape handling.
    if (
      configKind ||
      stagedReplace ||
      stagedInsert ||
      stagedMultiReplace ||
      stagedCollate ||
      isNormalizeOpen ||
      extractDialogState ||
      isPageLabelsOpen
    ) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    onClose,
    configKind,
    stagedReplace,
    stagedInsert,
    stagedMultiReplace,
    stagedCollate,
    isNormalizeOpen,
    extractDialogState,
    isPageLabelsOpen,
  ]);

  useEffect(() => () => {
    donorOperationRef.current?.abort('thumbnail context menu unmounted');
    donorOperationRef.current = null;
  }, []);

  const handleCommand = async (
    draft: PdfCommandDraft,
    successMessage: string,
    options?: {
      signal?: AbortSignal;
      documentKey?: string;
      resources?: CommandResources;
    },
  ) => {
    const commandDocumentKey = options?.documentKey ?? documentKey;
    if (!workingBytes || !commandDocumentKey) return;
    const result = await commandBus.execute({
      command: materializePdfCommand(
        draft,
        'thumbnail-menu',
        commandDocumentKey,
      ),
      workingBytes,
      resources: options?.resources,
      context: {
        currentPage: viewState.currentPage,
        selectedPages,
        fileName: fileName ?? 'document.pdf',
        documentKey: commandDocumentKey,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    if (!result.success) {
      if (result.error?.code === 'CANCELLED') return;
      addToast({
        type: 'error',
        title: 'Context Action Failed',
        message: result.error?.message ?? result.message,
      });
      return;
    }

    if (result.artifacts && result.artifacts.length > 0) {
      for (const artifact of result.artifacts) {
        if (artifact.kind !== 'pdf') continue;
        await FileAdapter.savePdfBytes(artifact.bytes, artifact.name, null);
      }
    }

    addToast({
      type: 'success',
      title: 'Context Action Complete',
      message: successMessage,
    });
    onClose();
  };

  const executeInsertPdf = async (
    staged: {
      donor: AdmittedDonorPdf;
      controller: AbortController;
      documentKey: string;
      initialPlacement: 'before' | 'after';
    },
    config: {
      donorPageIndices?: number[];
      placement: 'before' | 'after';
      targetPage: number;
    },
  ) => {
    const atIndex = config.placement === 'before'
      ? config.targetPage - 1
      : config.targetPage;
    const count = config.donorPageIndices?.length ?? staged.donor.pageCount;
    try {
      await handleCommand(
        {
          type: 'INSERT_PAGES',
          payload: {
            atIndex,
            donorResourceId: 'donor:0',
            donorPageIndices: config.donorPageIndices,
          },
        },
        `Inserted ${count} page(s) from ${staged.donor.fileName} ${config.placement} page ${config.targetPage}.`,
        {
          signal: staged.controller.signal,
          documentKey: staged.documentKey,
          resources: {
            donors: {
              'donor:0': staged.donor,
            },
          },
        },
      );
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const handleInsertPdf = async (position: 'before' | 'after') => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by a newer thumbnail donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_CONTEXT_MENU',
        'INSERT_PAGES',
        {
          signal: controller.signal,
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
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      setStagedInsert({
        donor,
        controller,
        documentKey: expectedDocumentKey,
        initialPlacement: position,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const handleReplacePage = async () => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by a newer thumbnail donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_CONTEXT_MENU',
        'REPLACE_PAGE',
        {
          signal: controller.signal,
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
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      if (donor.pageCount === 1) {
        await handleCommand(
          {
            type: 'REPLACE_PAGE',
            payload: {
              atIndex: page - 1,
              donorResourceId: 'donor:0',
              donorPageIndex: 0,
            },
          },
          `Replaced page ${page} using ${donor.fileName}.`,
          {
            signal: controller.signal,
            documentKey: expectedDocumentKey,
            resources: {
              donors: {
                'donor:0': donor,
              },
            },
          },
        );
        return;
      }

      setStagedReplace({
        donor,
        controller,
        documentKey: expectedDocumentKey,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const handleReplaceSelectedPages = async () => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by a newer thumbnail donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_CONTEXT_MENU',
        'INSERT_PAGES',
        {
          signal: controller.signal,
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
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      setStagedMultiReplace({
        donor,
        controller,
        documentKey: expectedDocumentKey,
        selectedPages: targetPages,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const executeMultiReplace = async (
    staged: {
      donor: AdmittedDonorPdf;
      controller: AbortController;
      documentKey: string;
      selectedPages: number[];
    },
    config: { donorPageIndices?: number[] },
  ) => {
    if (!workingBytes || !documentKey) return;
    const atIndex = staged.selectedPages[0] - 1;
    const donorPageCount = config.donorPageIndices?.length ?? staged.donor.pageCount;
    try {
      // 1. Insert donor pages before first selected page
      const insertResult = await commandBus.execute({
        command: materializePdfCommand(
          {
            type: 'INSERT_PAGES',
            payload: {
              atIndex,
              donorResourceId: 'donor:0',
              donorPageIndices: config.donorPageIndices,
            },
          },
          'thumbnail-menu',
          staged.documentKey,
        ),
        workingBytes,
        resources: {
          donors: {
            'donor:0': staged.donor,
          },
        },
        signal: staged.controller.signal,
      });

      if (!insertResult.success) {
        if (insertResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Replace Failed',
          message: insertResult.error?.message ?? insertResult.message,
        });
        return;
      }

      // 2. Delete original pages shifted by inserted donor count
      const shiftedDeleteIndices = staged.selectedPages.map(
        (pageNumber) => (pageNumber - 1) + donorPageCount,
      );

      const latestBytes = useSessionStore.getState().workingBytes || workingBytes;
      await commandBus.execute({
        command: materializePdfCommand(
          {
            type: 'DELETE_PAGES',
            payload: {
              pageIndices: shiftedDeleteIndices,
            },
          },
          'thumbnail-menu',
          staged.documentKey,
        ),
        workingBytes: latestBytes,
        signal: staged.controller.signal,
      });

      addToast({
        type: 'success',
        title: 'Pages Replaced',
        message: `Replaced ${staged.selectedPages.length} page(s) with ${donorPageCount} page(s) from ${staged.donor.fileName}.`,
      });
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
      onClose();
    }
  };

  const handleCollate = async () => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by a newer thumbnail donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_CONTEXT_MENU',
        'INSERT_PAGES',
        {
          signal: controller.signal,
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
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      setStagedCollate({
        donor,
        controller,
        documentKey: expectedDocumentKey,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const executeCollatePdf = async (
    staged: { donor: AdmittedDonorPdf; controller: AbortController; documentKey: string },
    config: { mode: 'forward' | 'reverse-duplex'; donorPageIndices?: number[] },
  ) => {
    if (!workingBytes || !documentKey) return;
    try {
      const resolved = inspectAdmittedDonorPdfs(
        'INSERT_PAGES',
        [staged.donor],
        staged.documentKey,
      );
      const collatedBytes = await collatePdfDocuments(
        workingBytes,
        resolved[0].bytes,
        {
          mode: config.mode,
          donorPageIndices: config.donorPageIndices,
          signal: staged.controller.signal,
        },
      );
      const lazy = await import('@/core/pdf/lazyPdfLib');
      const loaded = await (await lazy.pdfLib()).PDFDocument.load(collatedBytes);
      const newCount = loaded.getPageCount();

      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:collated',
              nextPageCount: newCount,
              reason: `Collate with ${staged.donor.fileName}`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:collated': collatedBytes,
          },
        },
        signal: staged.controller.signal,
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Collation Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Collation Complete',
        message: `Collated with ${staged.donor.fileName}. Total pages: ${newCount}.`,
      });
    } catch (error) {
      if (!isOperationCancelledError(error)) {
        addToast({
          type: 'error',
          title: 'Collation Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
      onClose();
    }
  };

  const confirmNormalizeDimensions = async (options: NormalizeOptions) => {
    if (!workingBytes || !documentKey) return;
    try {
      const result = await normalizePdfPageDimensions(workingBytes, options);
      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:normalized',
              nextPageCount: useSessionStore.getState().pageCount,
              reason: `Normalize page dimensions (${options.preset})`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:normalized': result.normalizedBytes,
          },
        },
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Normalization Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Normalization Complete',
        message: `Normalized ${result.modifiedPageCount} page(s) to ${options.preset}.`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Normalization Failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsNormalizeOpen(false);
      onClose();
    }
  };

  if (stagedInsert) {
    return (
      <InsertPdfDialog
        isOpen={true}
        donorFileName={stagedInsert.donor.fileName}
        donorPageCount={stagedInsert.donor.pageCount}
        currentPage={page}
        totalDocumentPages={useSessionStore.getState().pageCount}
        initialPlacement={stagedInsert.initialPlacement}
        onClose={() => {
          stagedInsert.controller.abort('insert dialog closed');
          setStagedInsert(null);
          onClose();
        }}
        onConfirm={(config) => {
          const staged = stagedInsert;
          setStagedInsert(null);
          void executeInsertPdf(staged, config);
        }}
      />
    );
  }

  if (stagedReplace) {
    return (
      <ReplacePageDialog
        isOpen={true}
        maxPages={stagedReplace.donor.pageCount}
        onClose={() => {
          stagedReplace.controller.abort('replace dialog closed');
          setStagedReplace(null);
          onClose();
        }}
        onConfirm={(donorPage) => {
          const staged = stagedReplace;
          setStagedReplace(null);
          void handleCommand(
            {
              type: 'REPLACE_PAGE',
              payload: {
                atIndex: page - 1,
                donorResourceId: 'donor:0',
                donorPageIndex: donorPage - 1,
              },
            },
            `Replaced page ${page} using page ${donorPage} from ${staged.donor.fileName}.`,
            {
              signal: staged.controller.signal,
              documentKey: staged.documentKey,
              resources: {
                donors: {
                  'donor:0': staged.donor,
                },
              },
            },
          );
        }}
      />
    );
  }

  if (stagedMultiReplace) {
    return (
      <InsertPdfDialog
        isOpen={true}
        donorFileName={stagedMultiReplace.donor.fileName}
        donorPageCount={stagedMultiReplace.donor.pageCount}
        currentPage={page}
        totalDocumentPages={useSessionStore.getState().pageCount}
        initialPlacement="before"
        onClose={() => {
          stagedMultiReplace.controller.abort('multi replace dialog closed');
          setStagedMultiReplace(null);
          onClose();
        }}
        onConfirm={(config) => {
          const staged = stagedMultiReplace;
          setStagedMultiReplace(null);
          void executeMultiReplace(staged, config);
        }}
      />
    );
  }

  if (stagedCollate) {
    return (
      <CollatePdfDialog
        isOpen={true}
        primaryFileName={fileName ?? 'document.pdf'}
        primaryPageCount={useSessionStore.getState().pageCount}
        donorFileName={stagedCollate.donor.fileName}
        donorPageCount={stagedCollate.donor.pageCount}
        onClose={() => {
          stagedCollate.controller.abort('collate dialog closed');
          setStagedCollate(null);
          onClose();
        }}
        onConfirm={(config) => {
          const staged = stagedCollate;
          setStagedCollate(null);
          void executeCollatePdf(staged, config);
        }}
      />
    );
  }

  if (isNormalizeOpen) {
    return (
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={useSessionStore.getState().pageCount}
        selectedPages={targetPages}
        currentPage={page}
        onClose={() => {
          setIsNormalizeOpen(false);
          onClose();
        }}
        onConfirm={(options) => void confirmNormalizeDimensions(options)}
      />
    );
  }

  if (extractDialogState) {
    return (
      <ExtractPagesDialog
        isOpen={true}
        documentFileName={fileName ?? 'document.pdf'}
        currentPage={page}
        totalDocumentPages={useSessionStore.getState().pageCount}
        selectedPages={targetPages}
        initialMode={extractDialogState.initialMode}
        onClose={() => {
          setExtractDialogState(null);
          onClose();
        }}
        onConfirm={async ({ pageIndices: selectedIndices, mode, outputFileName }) => {
          setExtractDialogState(null);
          const commandType = mode === 'split' ? 'SPLIT_PAGES' : 'EXTRACT_PAGES';
          const successMsg = mode === 'split'
            ? `Split ${selectedIndices.length} page(s) into ${outputFileName}.`
            : `Extracted ${selectedIndices.length} page(s) to ${outputFileName}.`;
          await handleCommand(
            {
              type: commandType,
              payload: { pageIndices: selectedIndices, outputName: outputFileName },
            },
            successMsg,
          );
        }}
      />
    );
  }

  if (isPageLabelsOpen && pageGraph) {
    return (
      <PageLabelsDialog
        isOpen={true}
        pageGraph={pageGraph}
        currentPageId={pageGraph.pages[page - 1]?.pageId ?? null}
        selectedPageIds={pageIds}
        onClose={() => {
          setIsPageLabelsOpen(false);
          onClose();
        }}
        onApply={async (ranges) => {
          if (!documentKey) return false;
          const result = await commandBus.execute({
            command: materializePdfCommand(
              {
                type: 'SET_PAGE_LABELS',
                payload: { ranges },
              },
              'thumbnail-menu',
              documentKey,
            ),
          });
          if (result.success) {
            addToast({
              type: 'success',
              title: 'Page Labels',
              message: 'Updated logical page labels.',
            });
          }
          return result.success;
        }}
      />
    );
  }

  if (configKind) {
    return (
      <ThumbnailMacroConfigDialog
        kind={configKind}
        pageIndices={pageIndices}
        pageIds={pageIds}
        onCancel={() => setConfigKind(null)}
        onApply={(command, message) => {
          setConfigKind(null);
          void handleCommand(command, message);
        }}
      />
    );
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 450),
    left: Math.min(x, window.innerWidth - 240),
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg py-1 w-56 text-sm"
      role="menu"
      aria-label="Page actions"
    >
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 90 } }, 'Rotated selected pages.')}
      >
        Rotate 90°
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setExtractDialogState({ isOpen: true, initialMode: 'extract' })}
      >
        Extract Pages...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setExtractDialogState({ isOpen: true, initialMode: 'split' })}
      >
        Split Pages...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'DUPLICATE_PAGES', payload: { pageIndices } }, 'Duplicated selected pages.')}
      >
        Duplicate Pages
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-red-600 dark:text-red-400"
        onClick={() => handleCommand({ type: 'DELETE_PAGES', payload: { pageIndices } }, 'Deleted selected pages.')}
      >
        Delete Pages
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() =>
          handleCommand(
            {
              type: 'INSERT_BLANK_PAGE',
              payload: {
                atIndex: targetPages[0] - 1,
                size: { width: 595, height: 842 },
              },
            },
            'Inserted blank page before selection.',
          )
        }
      >
        Insert Blank Before
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() =>
          handleCommand(
            {
              type: 'INSERT_BLANK_PAGE',
              payload: {
                atIndex: targetPages[targetPages.length - 1],
                size: { width: 595, height: 842 },
              },
            },
            'Inserted blank page after selection.',
          )
        }
      >
        Insert Blank After
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleInsertPdf('before')}
      >
        Insert PDF Before...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleInsertPdf('after')}
      >
        Insert PDF After...
      </button>
      {targetPages.length > 1 && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          onClick={() => void handleReplaceSelectedPages()}
        >
          Replace {targetPages.length} Selected Pages with PDF...
        </button>
      )}
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleReplacePage()}
      >
        {targetPages.length > 1 ? `Replace Page ${page} from PDF...` : 'Replace Page from PDF...'}
      </button>

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleCollate()}
      >
        Collate Document with PDF...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setIsNormalizeOpen(true)}
      >
        Normalize Page Dimensions...
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setConfigKind('pageNumbers')}
      >
        Add Page Numbers (Footer)...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setIsPageLabelsOpen(true)}
      >
        Page Numbering & Labels...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setConfigKind('fileHeader')}
      >
        Add File Header...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setConfigKind('textStamp')}
      >
        Batch Text Stamp...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setConfigKind('watermark')}
      >
        Diagonal Watermark...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-300"
        onClick={() => setConfigKind('visualMask')}
      >
        Visual Mask...
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => {
          onClose();
          onOpenMacros?.();
        }}
      >
        Open Macro Panel
      </button>
    </div>
  );
};
