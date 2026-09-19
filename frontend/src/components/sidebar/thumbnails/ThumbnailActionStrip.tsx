import React from 'react';
import { RotateCw, Scissors, Trash2, CopyPlus, Split, Hash, Heading } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { createSimpleHeaderFooterTextTemplate } from '@/core/header-footer/simpleTextTemplate';

interface ThumbnailActionStripProps {
  selectedPages: number[];
  currentPage: number;
}

export const ThumbnailActionStrip: React.FC<ThumbnailActionStripProps> = ({
  selectedPages,
  currentPage,
}) => {
  const targetPages = selectedPages.length > 0 ? selectedPages : [currentPage];
  const { workingBytes, documentKey, pageGraph } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    pageGraph: state.pageGraph,
  })));
  const pageIndices = targetPages.map((page) => page - 1);
  const targetPageIds = targetPages.flatMap((pageNumber) => {
    const pageId = pageGraph?.pages[pageNumber - 1]?.pageId;
    return pageId ? [pageId] : [];
  });

  const handleCommand = (draft: PdfCommandDraft) => {
    if (!workingBytes || !documentKey) return;
    void commandBus.execute({
      workingBytes,
      command: materializePdfCommand(
        draft,
        'thumbnail-menu',
        documentKey,
      ),
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
          onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 90 } })}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Extract">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'EXTRACT_PAGES', payload: { pageIndices } })}
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Split">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'SPLIT_PAGES', payload: { pageIndices } })}
        >
          <Split className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Duplicate">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'DUPLICATE_PAGES', payload: { pageIndices } })}
        >
          <CopyPlus className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => handleCommand({ type: 'DELETE_PAGES', payload: { pageIndices } })}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Page numbers">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            if (targetPageIds.length !== targetPages.length) return;
            handleCommand({
              type: 'APPLY_HEADER_FOOTER_TEMPLATE',
              payload: {
                template: createSimpleHeaderFooterTextTemplate({
                  name: 'Thumbnail page numbers',
                  selector: {
                    include: {
                      mode: 'pageIds',
                      pageIds: targetPageIds,
                    },
                  },
                  zone: 'footer',
                  text: 'Page {{physicalPage}} of {{pageCount}}',
                  align: 'center',
                  marginXPt: 24,
                  marginYPt: 20,
                  fontSizePt: 10,
                  color: '#475569',
                  opacity: 0.9,
                }),
              },
            });
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
          onClick={() => {
            if (targetPageIds.length !== targetPages.length) return;
            handleCommand({
              type: 'APPLY_HEADER_FOOTER_TEMPLATE',
              payload: {
                template: createSimpleHeaderFooterTextTemplate({
                  name: 'Thumbnail file header',
                  selector: {
                    include: {
                      mode: 'pageIds',
                      pageIds: targetPageIds,
                    },
                  },
                  zone: 'header',
                  text: '{{fileName}}',
                  align: 'right',
                  marginXPt: 24,
                  marginYPt: 18,
                  fontSizePt: 10,
                  color: '#334155',
                  opacity: 0.85,
                }),
              },
            });
          }
        >
          <Heading className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
};
