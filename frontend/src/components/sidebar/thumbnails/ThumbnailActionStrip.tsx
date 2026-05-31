import React from 'react';
import { RotateCw, Scissors, Trash2, CopyPlus, Split, Hash, Heading } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { dispatchCommand } from '@/core/commands/dispatch';
import type { DocumentCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';

interface ThumbnailActionStripProps {
  selectedPages: number[];
  currentPage: number;
}

export const ThumbnailActionStrip: React.FC<ThumbnailActionStripProps> = ({
  selectedPages,
  currentPage,
}) => {
  const targetPages = selectedPages.length > 0 ? selectedPages : [currentPage];
  const { workingBytes } = useSessionStore();
  const pageIndices = targetPages.map((page) => page - 1);

  const handleCommand = (command: DocumentCommand) => {
    if (!workingBytes) return;
    void dispatchCommand({
      source: 'thumbnail-menu',
      workingBytes,
      command,
    });
  };

  return (
    <div className="flex items-center space-x-1 p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 rounded-t-lg">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-2 flex-grow">
        {selectedPages.length > 0 ? `${selectedPages.length} selected` : 'Current page'}
      </span>
      <Tooltip content="Rotate">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'ROTATE_PAGES', pageIndices, angle: 90 })}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Extract">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'EXTRACT_PAGES', pageIndices })}
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Split">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'SPLIT_PAGES', pageIndices })}
        >
          <Split className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Duplicate">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'DUPLICATE_PAGES', pageIndices })}
        >
          <CopyPlus className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => handleCommand({ type: 'DELETE_PAGES', pageIndices })}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Page numbers">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            handleCommand({
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
            })
          }
        >
          <Hash className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Header file name">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            handleCommand({
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
            })
          }
        >
          <Heading className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
};
