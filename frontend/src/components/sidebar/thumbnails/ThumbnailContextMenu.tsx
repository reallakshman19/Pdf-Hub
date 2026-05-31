import React, { useEffect, useRef } from 'react';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { dispatchCommand } from '@/core/commands/dispatch';
import type { DocumentCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';

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
  const { workingBytes, fileName, viewState } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const targetPages = selectedPages.includes(page) ? selectedPages : [page];
  const pageIndices = targetPages.map((value) => value - 1);

  useEffect(() => {
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
  }, [onClose]);

  const handleCommand = async (command: DocumentCommand, successMessage: string) => {
    if (!workingBytes) return;
    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command,
      workingBytes,
      context: {
        currentPage: viewState.currentPage,
        selectedPages,
        fileName: fileName ?? 'document.pdf',
      },
    });
    if (!result.success) {
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
    if (!workingBytes) return;
    const [donor] = await FileAdapter.pickPdfFiles(false);
    if (!donor) return;
    await handleCommand(
      {
        type: 'REPLACE_PAGE',
        atIndex: page - 1,
        donorBytes: donor.bytes,
        donorPageIndex: 0,
      },
      `Replaced page ${page} using the first donor page from ${donor.name}.`,
    );
  };

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
        onClick={() =>
          handleCommand(
            {
              type: 'ADD_HEADER_FOOTER_TEXT',
              pageIndices,
              options: {
                zone: 'footer',
                text: 'Page {page} of {pages}',
                align: 'center',
                marginX: 24,
                marginY: 20,
                fontSize: 10,
                color: '#475569',
                opacity: 0.9,
                pageNumberToken: true,
              },
            },
            'Added page numbers to footer.',
          )
        }
      >
        Add Page Numbers (Footer)
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() =>
          handleCommand(
            {
              type: 'ADD_HEADER_FOOTER_TEXT',
              pageIndices,
              options: {
                zone: 'header',
                text: '{file}',
                align: 'right',
                marginX: 24,
                marginY: 18,
                fontSize: 10,
                color: '#334155',
                opacity: 0.85,
                fileNameToken: true,
              },
            },
            'Added file name to header.',
          )
        }
      >
        Add File Header
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        onClick={() =>
          handleCommand(
            {
              type: 'DRAW_TEXT_ON_PAGES',
              pageIndices,
              options: {
                text: 'REVIEW COPY',
                x: 32,
                y: 32,
                fontSize: 11,
                color: '#7c2d12',
                opacity: 0.75,
                align: 'left',
              },
            },
            'Applied text batch stamp on selected pages.',
          )
        }
      >
        Batch Text Stamp
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
