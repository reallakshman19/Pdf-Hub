import React, { useEffect, useRef } from 'react';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { dispatchCommand } from '@/core/commands/dispatch';
import type { DocumentCommand } from '@/core/commands/types';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import {
  ThumbnailMacroConfigDialog,
  type ThumbnailMacroKind,
} from './ThumbnailMacroConfigDialog';

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
  const { workingBytes, documentKey, fileName, viewState } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    fileName: state.fileName,
    viewState: state.viewState,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const targetPages = selectedPages.includes(page) ? selectedPages : [page];
  const pageIndices = targetPages.map((value) => value - 1);
  const [configKind, setConfigKind] = React.useState<ThumbnailMacroKind | null>(
    null,
  );

  useEffect(() => {
    // While the config dialog is open it owns outside-click / Escape handling.
    if (configKind) return;

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
  }, [onClose, configKind]);

  useEffect(() => () => {
    donorOperationRef.current?.abort('thumbnail context menu unmounted');
    donorOperationRef.current = null;
  }, []);

  const handleCommand = async (
    command: DocumentCommand,
    successMessage: string,
    options?: { signal?: AbortSignal; documentKey?: string },
  ) => {
    if (!workingBytes) return;
    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command,
      workingBytes,
      context: {
        currentPage: viewState.currentPage,
        selectedPages,
        fileName: fileName ?? 'document.pdf',
        ...(options?.documentKey ? { documentKey: options.documentKey } : {}),
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

  const handleReplaceCurrentPage = async () => {
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
      await handleCommand(
        {
          type: 'REPLACE_PAGE',
          atIndex: page - 1,
          donor,
          donorPageIndex: 0,
        },
        `Replaced page ${page} using the first donor page from ${donor.fileName}.`,
        {
          signal: controller.signal,
          documentKey: expectedDocumentKey,
        },
      );
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  if (configKind) {
    return (
      <ThumbnailMacroConfigDialog
        kind={configKind}
        pageIndices={pageIndices}
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
    top: Math.min(y, window.innerHeight - 380),
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
        onClick={() => handleCommand({ type: 'ROTATE_PAGES', pageIndices, angle: 90 }, 'Rotated selected pages.')}
      >
        Rotate 90°
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'EXTRACT_PAGES', pageIndices }, 'Extracted selected pages.')}
      >
        Extract Pages
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'SPLIT_PAGES', pageIndices }, 'Split selected pages into a new file.')}
      >
        Split Pages
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => handleCommand({ type: 'DUPLICATE_PAGES', pageIndices }, 'Duplicated selected pages.')}
      >
        Duplicate Pages
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-red-600 dark:text-red-400"
        onClick={() => handleCommand({ type: 'DELETE_PAGES', pageIndices }, 'Deleted selected pages.')}
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
              atIndex: targetPages[0] - 1,
              size: { width: 595, height: 842 },
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
              atIndex: targetPages[targetPages.length - 1],
              size: { width: 595, height: 842 },
            },
            'Inserted blank page after selection.',
          )
        }
      >
        Insert Blank After
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() => void handleReplaceCurrentPage()}
      >
        Replace Current Page (Donor p1)
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
