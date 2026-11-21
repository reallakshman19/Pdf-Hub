import { create } from 'zustand';
import type { TextFormatType } from 'lexical';
import type { WriterBlockType } from './lexical-nodes/blockHelpers';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import { useWriterV2Store } from './writerV2Store';
import { isRichEditorOwnerCurrent, type RichEditorOwner } from './editor/richEditorOwnership';

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
      asset: WriterAssetRecordV2;
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

export interface OwnedRichEditorCommand {
  owner: RichEditorOwner;
  command: PendingRichEditorCommand;
}

function matchesOwner(a: RichEditorOwner, b: RichEditorOwner): boolean {
  return a.document.generation === b.document.generation
    && a.target.id === b.target.id
    && a.target.documentFingerprint === b.target.documentFingerprint
    && a.target.createdAt === b.target.createdAt
    && a.target.editorStateJson === b.target.editorStateJson
    && a.target.plainText === b.target.plainText
    && a.blankMeta === b.blankMeta;
}

function isEditingOwner(owner: RichEditorOwner): boolean {
  return useWriterV2Store.getState().editingId === owner.target.id
    && isRichEditorOwnerCurrent(owner);
}

interface RichEditorCommandQueueState {
  pending: OwnedRichEditorCommand[];
  enqueue: (command: PendingRichEditorCommand, owner: RichEditorOwner) => boolean;
  drain: (owner: RichEditorOwner) => PendingRichEditorCommand[];
  discard: (owner: RichEditorOwner) => void;
  clear: () => void;
}

export const useRichEditorCommandQueue = create<RichEditorCommandQueueState>((set, get) => ({
  pending: [],
  enqueue: (command, owner) => {
    if (!isEditingOwner(owner)) return false;
    set(state => ({ pending: [...state.pending.filter(item => isEditingOwner(item.owner)), { owner, command }] }));
    return true;
  },
  drain: owner => {
    if (!isEditingOwner(owner)) return [];
    const valid = get().pending.filter(item => isEditingOwner(item.owner));
    const matching = valid.filter(item => matchesOwner(item.owner, owner));
    set({ pending: valid.filter(item => !matchesOwner(item.owner, owner)) });
    return matching.map(item => item.command);
  },
  discard: owner => set(state => ({ pending: state.pending.filter(item => !matchesOwner(item.owner, owner)) })),
  clear: () => set({ pending: [] }),
}));

// A switch away (including close/reopen of the same object) invalidates pending
// editor commands. Never let a later editor inherit an abandoned gesture.
useWriterV2Store.subscribe((state, previous) => {
  if (state.editingId !== previous.editingId || state.currentDocumentFingerprint !== previous.currentDocumentFingerprint
    || state.elements !== previous.elements || state.documentMeta !== previous.documentMeta) {
    const queue = useRichEditorCommandQueue.getState();
    const pending = queue.pending.filter(item => isEditingOwner(item.owner));
    if (pending.length !== queue.pending.length) useRichEditorCommandQueue.setState({ pending });
  }
});
