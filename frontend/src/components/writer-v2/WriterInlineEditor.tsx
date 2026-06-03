import React from 'react';
import type { EditorState, LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { ListNode, ListItemNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { QuoteNode } from '@lexical/rich-text';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { ImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';
import { HeadingNode } from '@/core/writer-v2/lexical-nodes/headingHelpers';
import { WriterClipboardPlugin } from './WriterClipboardPlugin';
import { ImageDropPlugin } from './plugins/ImageDropPlugin';
import { TablePastePlugin } from './plugins/TablePastePlugin';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  normalizeEditorStateJson,
  type WriterEditorSavePayload,
} from '@/core/writer-v2/editor/writerEditorState';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
import './writerEditorTheme.css';

export interface WriterInlineEditorProps {
  element: WriterElementV2;
  onSave: (payload: WriterEditorSavePayload) => void;
  onCancel: () => void;
}

export const WriterInlineEditor: React.FC<WriterInlineEditorProps> = ({
  element,
  onSave,
  onCancel,
}) => {
  const editorRef = React.useRef<LexicalEditor | null>(null);
  const latestStateRef = React.useRef<EditorState | null>(null);
  const pendingAssetsRef = React.useRef<WriterAssetRecordV2[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const hasSavedRef = React.useRef(false);

  const initialEditorStateJson = React.useMemo(
    () => normalizeEditorStateJson(element.editorStateJson, element.plainText ?? ''),
    [element.editorStateJson, element.plainText],
  );

  const composerKey = React.useMemo(
    () => `${element.id}::${initialEditorStateJson}`,
    [element.id, initialEditorStateJson],
  );

  const initialConfig = React.useMemo(() => {
    return {
      namespace: `writer-v2-inline-${element.id}`,
      nodes: [
        ListNode,
        ListItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        ImageNode,
        HeadingNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        HorizontalRuleNode,
      ],
      editorState: initialEditorStateJson,
      theme: {
        paragraph: 'writer-v2-editor-paragraph',
        quote: 'writer-v2-editor-quote',
        code: 'writer-v2-editor-code',
        text: {
          bold: 'writer-v2-editor-bold',
          italic: 'writer-v2-editor-italic',
          underline: 'writer-v2-editor-underline',
          strikethrough: 'writer-v2-editor-strikethrough',
          subscript: 'writer-v2-editor-subscript',
          superscript: 'writer-v2-editor-superscript',
          code: 'writer-v2-editor-text-code',
        },
      },
      onError(error: Error) {
        throw error;
      },
    };
  }, [element.id, initialEditorStateJson]);

  const save = React.useCallback(() => {
    if (hasSavedRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;

    const editorState = latestStateRef.current ?? editor.getEditorState();
    let plainText = '';

    editorState.read(() => {
      plainText = $getRoot().getTextContent().trim();
    });

    hasSavedRef.current = true;
    onSave({
      editorStateJson: JSON.stringify(editorState.toJSON()),
      plainText,
      assets: [...pendingAssetsRef.current],
    });
  }, [onSave]);

  // Capture Escape and Ctrl+Enter
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        save();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel, save]);

  // Outside click logic
  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Ignore clicks inside the active editor, formatting ribbon, or popups/modals
      if (
        containerRef.current?.contains(target) ||
        target.closest('[data-writer-ribbon]') ||
        target.closest('[data-color-picker-popover]') ||
        target.closest('[role="dialog"]') ||
        target.closest('.color-picker-popover')
      ) {
        return;
      }

      save();
    };

    document.addEventListener('pointerdown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick, true);
    };
  }, [save]);

  // Auto-save on real unmount (e.g. tool mode switch). The initial timeout lets
  // React StrictMode's development-only effect cleanup run without saving and
  // closing the editor immediately after it opens.
  const saveRef = React.useRef(save);
  const allowUnmountSaveRef = React.useRef(false);
  React.useEffect(() => {
    saveRef.current = save;
  });
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      allowUnmountSaveRef.current = true;
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (!allowUnmountSaveRef.current) return;

      saveRef.current();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-writer-v2-inline-editor="true"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: 'text',
      }}
    >
      <LexicalComposer key={composerKey} initialConfig={initialConfig}>
        <ActiveEditorRegisterPlugin
          onEditor={(editor) => {
            editorRef.current = editor;
          }}
        />

        <OnChangePlugin
          onChange={(editorState) => {
            latestStateRef.current = editorState;
          }}
        />

        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Writer rich text inline editor"
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                outline: 'none',
                whiteSpace: 'pre-wrap',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                lineHeight: 'inherit',
                color: 'inherit',
              }}
            />
          }
          placeholder={
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                pointerEvents: 'none',
                color: '#9ca3af',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              Type content here...
            </div>
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ErrorBoundary={LexicalErrorBoundary as React.ComponentType<any>}
        />
        <HistoryPlugin />
        <ListPlugin />
        <TablePlugin />
        <HorizontalRulePlugin />
        <WriterClipboardPlugin
          documentFingerprint={element.documentFingerprint}
          onAssetsImported={(assets) => {
            pendingAssetsRef.current = [
              ...pendingAssetsRef.current,
              ...assets,
            ];
          }}
        />
        <ImageDropPlugin
          documentFingerprint={element.documentFingerprint}
          onAssetsImported={(assets) => {
            pendingAssetsRef.current = [
              ...pendingAssetsRef.current,
              ...assets,
            ];
          }}
        />
        <TablePastePlugin />
      </LexicalComposer>
    </div>
  );
};

function ActiveEditorRegisterPlugin({
  onEditor,
}: {
  onEditor: (editor: LexicalEditor) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const setActiveEditor = useActiveEditorStore((state) => state.setActiveEditor);

  React.useEffect(() => {
    onEditor(editor);
    setActiveEditor(editor);

    return () => {
      if (useActiveEditorStore.getState().activeEditor === editor) {
        setActiveEditor(null);
      }
    };
  }, [editor, onEditor, setActiveEditor]);

  return null;
}
