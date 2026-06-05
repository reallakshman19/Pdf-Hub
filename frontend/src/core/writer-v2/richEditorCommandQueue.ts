import { create } from 'zustand';
import type { TextFormatType } from 'lexical';
import type { WriterBlockType } from './lexical-nodes/blockHelpers';

export type PendingElementFormat =
  | 'left'
  | 'start'
  | 'center'
  | 'right'
  | 'end'
  | 'justify';

export type PendingListCommand =
  | 'bullet'
  | 'number'
  | 'check'
  | 'remove';

export interface PendingRichTemplateBlock {
  kind: 'heading' | 'paragraph';
  text: string;
  level?: 1 | 2 | 3;
  style?: string;
}

export type PendingRichEditorCommand =
  | {
      type: 'insertTable';
      rows: number;
      cols: number;
    }
  | {
      type: 'insertTemplateSnippet';
      blocks: PendingRichTemplateBlock[];
    }
  | {
      type: 'insertImage';
      src: string;
      altText: string;
      width?: number | 'inherit';
      height?: number | 'inherit';
      caption?: string;
    }
  | {
      type: 'applyHeading';
      level: 1 | 2 | 3;
    }
  | {
      type: 'formatText';
      format: TextFormatType;
    }
  | {
      type: 'formatElement';
      format: PendingElementFormat;
    }
  | {
      type: 'indent';
    }
  | {
      type: 'outdent';
    }
  | {
      type: 'list';
      command: PendingListCommand;
    }
  | {
      type: 'horizontalRule';
    }
  | {
      type: 'applyTextStyle';
      property: string;
      value: string;
    }
  | {
      type: 'applyBlockStyle';
      style: Record<string, string>;
    }
  | {
      type: 'toggleBlockType';
      blockType: WriterBlockType;
    }
  | {
      type: 'clearFormatting';
    }
  | {
      type: 'focus';
    };

interface RichEditorCommandQueueState {
  pending: PendingRichEditorCommand[];
  enqueue: (command: PendingRichEditorCommand) => void;
  drain: () => PendingRichEditorCommand[];
  clear: () => void;
}

export const useRichEditorCommandQueue = create<RichEditorCommandQueueState>((set, get) => ({
  pending: [],
  enqueue: (command) =>
    set((state) => ({
      pending: [...state.pending, command],
    })),
  drain: () => {
    const pending = get().pending;
    set({ pending: [] });
    return pending;
  },
  clear: () => set({ pending: [] }),
}));
