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
import { BatesNumberingDialog } from '@/components/dialogs/BatesNumberingDialog';
import { CropMarginsDialog } from '@/components/dialogs/CropMarginsDialog';
import {
  ThumbnailMacroConfigDialog,
  type ThumbnailMacroKind,
} from './ThumbnailMacroConfigDialog';
import { collatePdfDocuments } from '@/core/pdf-mutation/pdfCollation';
import { normalizePdfPageDimensions, type NormalizeOptions } from '@/core/pdf-mutation/pdfNormalization';
import { createSplitPagesZipBundle } from '@/core/pdf-mutation/pdfSplitBundle';
import {
  applyBatesNumbering,
  type BatesNumberingOptions,
} from '@/core/pdf-mutation/pdfBatesNumbering';
import {
  cropPdfMargins,
  calculateContentBoundingBoxFromRgba,
  type CropMarginOptions,
  type DetectedBoundingBox,
} from '@/core/pdf-mutation/pdfMarginCropping';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { usePageClipboardStore, serializeSelectedPagesToPdf } from '@/core/clipboard/pageClipboardStore';
import { copyPageImageToClipboard, downloadPageAsPng } from '@/core/thumbnails/quickPageExport';
import { usePdfStore } from '@/core/session/pdfStore';
import { flattenNativePdfAnnotations } from '@/core/pdf-annotations/flattenNativePdfAnnotations';

interface ThumbnailContextMenuProps {
  x: number;
  y: number;
  page: number;
  selectedPages: number[];
  onClose: () => void;
  onOpenMacros?: () => void;
  onOpenOcr?: () => void;
}

export const ThumbnailContextMenu: React.FC<ThumbnailContextMenuProps> = ({
  x,
  y,
  page,
  selectedPages,
  onClose,
  onOpenMacros,
  onOpenOcr,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const donorOperationRef = useRef<AbortController | null>(null);
  const pdfDoc = usePdfStore((state) => state.pdfDoc);
  const { clipboard, copyPages, cutPages, clearClipboard } = usePageClipboardStore();
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
  const targetPages = (selectedPages.includes(page) ? [...selectedPages] : [page]).sort((a, b) => a - b);
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
  const [isBatesOpen, setIsBatesOpen] = React.useState(false);
  const [isCropMarginsOpen, setIsCropMarginsOpen] = React.useState(false);
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
      isBatesOpen ||
      isCropMarginsOpen ||
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
    isBatesOpen,
    isCropMarginsOpen,
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

  const confirmBatesNumbering = async (options: BatesNumberingOptions) => {
    if (!workingBytes || !documentKey) return;
    try {
      const result = await applyBatesNumbering(workingBytes, options);
      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:bates',
              nextPageCount: useSessionStore.getState().pageCount,
              reason: `Bates numbering (${result.sampleFirstStamp})`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:bates': result.modifiedBytes,
          },
        },
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Bates Numbering Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Bates Numbering Complete',
        message: `Stamped ${result.stampedPageCount} page(s) (e.g. ${result.sampleFirstStamp}).`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Bates Numbering Error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsBatesOpen(false);
      onClose();
    }
  };

  const confirmCropMargins = async (options: CropMarginOptions) => {
    if (!workingBytes || !documentKey) return;
    try {
      let detectedBoxes: Record<number, DetectedBoundingBox> | undefined;

      if (options.mode === 'auto' && pdfDoc) {
        detectedBoxes = {};
        const indices = options.pageIndices ?? Array.from({ length: useSessionStore.getState().pageCount }, (_, i) => i);
        for (const idx of indices) {
          try {
            const pageProxy = await pdfDoc.getPage(idx + 1);
            const viewport = pageProxy.getViewport({ scale: 1.0 });
            const canvas = document.createElement('canvas');
            await PdfRendererAdapter.renderPage(pageProxy, canvas, viewport).completed;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx && canvas.width > 0 && canvas.height > 0) {
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const cropOffset = pageProxy.view ? { x: pageProxy.view[0], y: pageProxy.view[1] } : { x: 0, y: 0 };
              detectedBoxes[idx] = calculateContentBoundingBoxFromRgba(
                imgData.data,
                canvas.width,
                canvas.height,
                viewport.width,
                viewport.height,
                options.autoPaddingPt ?? 14,
                pageProxy.rotate ?? 0,
                cropOffset,
              );
            }
          } catch {
            // fallback to conservative trim inside cropPdfMargins
          }
        }
      }

      const result = await cropPdfMargins(workingBytes, {
        ...options,
        detectedBoxes,
      });

      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:cropped',
              nextPageCount: useSessionStore.getState().pageCount,
              reason: `Crop margins (${options.mode})`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:cropped': result.modifiedBytes,
          },
        },
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Crop Margins Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Crop Margins Complete',
        message: `Cropped margins on ${result.croppedPageCount} page(s).`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Crop Margins Error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCropMarginsOpen(false);
      onClose();
    }
  };

  const handleAutoTrimMargins = async () => {
    await confirmCropMargins({
      mode: 'auto',
      pageIndices,
      autoPaddingPt: 14,
    });
  };

  const handleQuickSaveSelectedPages = async () => {
    if (!workingBytes) return;
    try {
      const extractedBytes = await serializeSelectedPagesToPdf(workingBytes, pageIndices);
      const baseName = (fileName ?? 'document.pdf').replace(/\.[^/.]+$/, '');
      const rangeSuffix = targetPages.length === 1 ? `p${targetPages[0]}` : `p${targetPages[0]}-p${targetPages[targetPages.length - 1]}`;
      const saveName = `${baseName}_${rangeSuffix}.pdf`;
      await FileAdapter.savePdfBytes(extractedBytes, saveName, null);
      addToast({
        type: 'success',
        title: 'Pages Extracted',
        message: `Saved ${targetPages.length} page(s) as ${saveName}.`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Extraction Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      onClose();
    }
  };

  const handleCopyPages = async () => {
    if (!workingBytes || !documentKey) return;
    try {
      const serialized = await serializeSelectedPagesToPdf(workingBytes, pageIndices);
      copyPages({
        sourceDocumentKey: documentKey,
        sourceFileName: fileName ?? 'document.pdf',
        pageIndices,
        serializedPagesBytes: serialized,
      });
      addToast({
        type: 'info',
        title: 'Pages Copied',
        message: `Copied ${targetPages.length} page(s) to clipboard.`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Copy Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      onClose();
    }
  };

  const handleCutPages = async () => {
    if (!workingBytes || !documentKey) return;
    try {
      const serialized = await serializeSelectedPagesToPdf(workingBytes, pageIndices);
      cutPages({
        sourceDocumentKey: documentKey,
        sourceFileName: fileName ?? 'document.pdf',
        pageIndices,
        serializedPagesBytes: serialized,
      });
      addToast({
        type: 'info',
        title: 'Pages Cut',
        message: `Cut ${targetPages.length} page(s) to clipboard. Paste to place them.`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Cut Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      onClose();
    }
  };

  const handlePastePages = async (placement: 'before' | 'after') => {
    if (!workingBytes || !documentKey || !clipboard) return;
    const atIndex = placement === 'before' ? targetPages[0] - 1 : targetPages[targetPages.length - 1];
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const file = new File(
        [clipboard.serializedPagesBytes.slice()],
        clipboard.sourceFileName || 'clipboard.pdf',
        { type: 'application/pdf' },
      );
      const admission = await admitDonorPdfFiles(
        [{ file }],
        'THUMBNAIL_CONTEXT_MENU',
        'INSERT_PAGES',
        {
          signal: controller.signal,
          ownerDocumentKey: expectedDocumentKey,
          isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
        },
      );
      if (admission.outcome !== 'ACCEPTED') {
        addToast({
          type: 'error',
          title: 'Paste Failed',
          message: firstDonorAdmissionErrorMessage(admission) ?? 'Clipboard content could not be admitted.',
        });
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(admission.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = admission.value.donors[0];
      const insertResult = await commandBus.execute({
        command: materializePdfCommand(
          {
            type: 'INSERT_PAGES',
            payload: {
              atIndex,
              donorResourceId: 'donor:clipboard',
            },
          },
          'thumbnail-menu',
          expectedDocumentKey,
        ),
        workingBytes,
        resources: {
          donors: {
            'donor:clipboard': donor,
          },
        },
        signal: controller.signal,
      });

      if (!insertResult.success) {
        addToast({
          type: 'error',
          title: 'Paste Failed',
          message: insertResult.error?.message ?? insertResult.message,
        });
        return;
      }

      // If this was a Cut operation from the same document, delete original cut pages
      if (clipboard.isCut && clipboard.sourceDocumentKey === expectedDocumentKey) {
        const donorCount = donor.pageCount;
        const latestBytes = useSessionStore.getState().workingBytes || workingBytes;
        const shiftedCutIndices = clipboard.pageIndices.map((idx) => (idx >= atIndex ? idx + donorCount : idx));
        const deleteResult = await commandBus.execute({
          command: materializePdfCommand(
            {
              type: 'DELETE_PAGES',
              payload: {
                pageIndices: shiftedCutIndices,
              },
            },
            'thumbnail-menu',
            expectedDocumentKey,
          ),
          workingBytes: latestBytes,
          signal: controller.signal,
        });
        if (!deleteResult.success) {
          // The pasted copy is already in place; keep the clipboard so the
          // user can see what happened and remove the originals manually.
          addToast({
            type: 'error',
            title: 'Cut Source Not Removed',
            message: `Pasted ${donor.pageCount} page(s), but the original cut pages could not be removed: ${deleteResult.error?.message ?? deleteResult.message}`,
          });
          return;
        }
        clearClipboard();
      }

      addToast({
        type: 'success',
        title: 'Pages Pasted',
        message: `Pasted ${donor.pageCount} page(s) ${placement}.`,
      });
    } catch (err) {
      if (!isOperationCancelledError(err)) {
        addToast({
          type: 'error',
          title: 'Paste Failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
      onClose();
    }
  };

  const handleReverseOrder = async () => {
    const totalPages = useSessionStore.getState().pageCount;
    if (totalPages <= 1) return;
    const currentOrder = Array.from({ length: totalPages }, (_, i) => i);
    const sortedTargetIndices = [...pageIndices].sort((a, b) => a - b);
    const reversedTargetIndices = [...sortedTargetIndices].reverse();
    const nextOrder = [...currentOrder];
    for (let i = 0; i < sortedTargetIndices.length; i++) {
      nextOrder[sortedTargetIndices[i]] = reversedTargetIndices[i];
    }
    await handleCommand(
      { type: 'REORDER_PAGES_BY_ORDER', payload: { order: nextOrder } },
      `Reversed order of ${pageIndices.length} page(s).`,
    );
  };

  const handleCopyPageImage = async () => {
    if (!pdfDoc) {
      addToast({
        type: 'error',
        title: 'Copy Image Failed',
        message: 'PDF document is not yet rendered.',
      });
      return;
    }
    try {
      const result = await copyPageImageToClipboard(pdfDoc, page, 2.0);
      addToast({
        type: result.success ? 'success' : 'error',
        title: result.success ? 'Page Copied' : 'Copy Failed',
        message: result.message,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Copy Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      onClose();
    }
  };

  const handleExportPagePng = async () => {
    if (!pdfDoc) {
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: 'PDF document is not yet rendered.',
      });
      return;
    }
    try {
      await downloadPageAsPng(pdfDoc, page, fileName ?? 'document.pdf', 2.0);
      addToast({
        type: 'success',
        title: 'Page Exported',
        message: `Page ${page} exported as PNG.`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      onClose();
    }
  };

  const handleFlattenAnnotations = async (scope: 'selected' | 'document' = 'selected') => {
    if (!workingBytes || !documentKey) return;
    const isSelective = scope === 'selected';
    const targetIndices = isSelective ? pageIndices : undefined;
    try {
      const flattenedBytes = await flattenNativePdfAnnotations(workingBytes, targetIndices);
      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:flattened',
              nextPageCount: useSessionStore.getState().pageCount,
              reason: isSelective
                ? `Flatten annotations on page(s) ${targetPages.join(', ')}`
                : 'Flatten annotations into page graphics',
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:flattened': flattenedBytes,
          },
        },
      });

      if (!cmdResult.success) {
        addToast({
          type: 'error',
          title: 'Flatten Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Annotations Flattened',
        message: isSelective
          ? `Burned annotations permanently into page graphics on ${targetPages.length} page(s).`
          : 'All annotations permanently burned into page graphics.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Flatten Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
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

  if (isBatesOpen) {
    return (
      <BatesNumberingDialog
        isOpen={true}
        totalDocumentPages={useSessionStore.getState().pageCount}
        selectedPages={targetPages}
        currentPage={page}
        onClose={() => {
          setIsBatesOpen(false);
          onClose();
        }}
        onConfirm={(options) => void confirmBatesNumbering(options)}
      />
    );
  }

  if (isCropMarginsOpen) {
    return (
      <CropMarginsDialog
        isOpen={true}
        totalDocumentPages={useSessionStore.getState().pageCount}
        selectedPages={targetPages}
        currentPage={page}
        onClose={() => {
          setIsCropMarginsOpen(false);
          onClose();
        }}
        onConfirm={(options) => void confirmCropMargins(options)}
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
        onConfirm={async ({ pageIndices: selectedIndices, mode, outputFileName, packageAsZip }) => {
          setExtractDialogState(null);
          if (packageAsZip && workingBytes) {
            try {
              const zipResult = await createSplitPagesZipBundle(
                workingBytes,
                selectedIndices,
                outputFileName,
              );
              await FileAdapter.savePdfBytes(zipResult.zipBytes, outputFileName, null);
              if (mode === 'split') {
                await handleCommand(
                  {
                    type: 'DELETE_PAGES',
                    payload: { pageIndices: selectedIndices },
                  },
                  `Split ${selectedIndices.length} page(s) into ${outputFileName} and removed from original.`,
                );
              } else {
                addToast({
                  type: 'success',
                  title: 'Pages Packaged',
                  message: `Packaged ${selectedIndices.length} page(s) into ${outputFileName}.`,
                });
                onClose();
              }
            } catch (err) {
              addToast({
                type: 'error',
                title: 'Packaging Failed',
                message: err instanceof Error ? err.message : String(err),
              });
              onClose();
            }
            return;
          }
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
    top: Math.min(y, window.innerHeight - 560),
    left: Math.min(x, window.innerWidth - 270),
    zIndex: 1000,
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg py-1 w-64 text-sm"
      role="menu"
      aria-label="Page actions"
    >
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 90 } }, 'Rotated selected pages 90° clockwise.')}
      >
        Rotate 90° Clockwise
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 270 } }, 'Rotated selected pages 90° counter-clockwise.')}
      >
        Rotate 90° Counter-Clockwise
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 180 } }, 'Rotated selected pages 180°.')}
      >
        Rotate 180° (Flip)
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleCopyPages()}
      >
        {targetPages.length > 1 ? `Copy ${targetPages.length} Pages` : 'Copy Page'}
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleCutPages()}
      >
        {targetPages.length > 1 ? `Cut ${targetPages.length} Pages` : 'Cut Page'}
      </button>
      {clipboard && (
        <>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            onClick={() => void handlePastePages('before')}
          >
            Paste {clipboard.pageIndices.length} Page(s) Before
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            onClick={() => void handlePastePages('after')}
          >
            Paste {clipboard.pageIndices.length} Page(s) After
          </button>
        </>
      )}
      {targetPages.length > 1 && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          onClick={() => void handleReverseOrder()}
        >
          Reverse Selected Page Order
        </button>
      )}

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleCopyPageImage()}
      >
        Copy Page Image to Clipboard
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleExportPagePng()}
      >
        Export Page as PNG...
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      {onOpenOcr && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          onClick={() => {
            onClose();
            onOpenOcr();
          }}
        >
          {targetPages.length > 1 ? `Run OCR on ${targetPages.length} Selected Pages...` : `Run OCR on Page ${page}...`}
        </button>
      )}
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleFlattenAnnotations('selected')}
      >
        {targetPages.length > 1
          ? `Flatten Annotations on ${targetPages.length} Pages`
          : `Flatten Annotations on Page ${page}`}
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleFlattenAnnotations('document')}
      >
        Flatten Annotations on Document...
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleQuickSaveSelectedPages()}
      >
        {targetPages.length > 1
          ? `Quick Save ${targetPages.length} Pages as PDF`
          : `Quick Save Page ${page} as PDF`}
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
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setIsCropMarginsOpen(true)}
      >
        Crop Page Margins...
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleAutoTrimMargins()}
      >
        Auto-Trim White Margins
      </button>

      <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => setIsBatesOpen(true)}
      >
        Bates Numbering / Revision Stamp...
      </button>
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
