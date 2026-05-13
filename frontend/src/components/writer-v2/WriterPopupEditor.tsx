import React from 'react';
import type { EditorState, LexicalEditor } from 'lexical';
import {
  $getRoot,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { ListNode, ListItemNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { WriterClipboardPlugin } from './WriterClipboardPlugin';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';

import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  normalizeEditorStateJson,
  type WriterEditorSavePayload,
} from '@/core/writer-v2/editor/writerEditorState';

export interface WriterPopupEditorProps {
  element: WriterElementV2;
  onSave: (payload: WriterEditorSavePayload) => void;
  onCancel: () => void;
}

export const WriterPopupEditor: React.FC<WriterPopupEditorProps> = ({
  element,
  onSave,
  onCancel,
}) => {
  const editorRef = React.useRef<LexicalEditor | null>(null);
  const latestStateRef = React.useRef<EditorState | null>(null);
  const pendingAssetsRef = React.useRef<WriterAssetRecordV2[]>([]);

  const initialConfig = React.useMemo(() => {
    return {
      namespace: `writer-v2-${element.id}`,
      nodes: [
        ListNode,
        ListItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      editorState: normalizeEditorStateJson(
        element.editorStateJson,
        element.plainText ?? '',
      ),
      theme: {
        paragraph: 'writer-v2-editor-paragraph',
        text: {
          bold: 'writer-v2-editor-bold',
          italic: 'writer-v2-editor-italic',
          underline: 'writer-v2-editor-underline',
        },
      },
      onError(error: Error) {
        throw error;
      },
    };
  }, [element.id, element.editorStateJson, element.plainText]);

  const save = React.useCallback(() => {
    const editor = editorRef.current;
    const editorState = latestStateRef.current ?? editor?.getEditorState();

    if (!editorState) return;

    let plainText = '';

    editorState.read(() => {
      plainText = $getRoot().getTextContent().trim();
    });

    onSave({
      editorStateJson: JSON.stringify(editorState.toJSON()),
      plainText,
      assets: [...pendingAssetsRef.current],
    });
  }, [onSave]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit writer element ${element.id}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return;
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          save();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.38)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        data-writer-v2-popup-editor="true"
        style={{
          width: 'min(760px, calc(100vw - 48px))',
          maxHeight: 'min(620px, calc(100vh - 48px))',
          background: '#ffffff',
          color: '#111827',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridgePlugin
            onEditor={(editor) => {
              editorRef.current = editor;
            }}
          />

          <OnChangePlugin
            onChange={(editorState) => {
              latestStateRef.current = editorState;
            }}
          />

          <WriterPopupToolbar />

          <div
            style={{
              padding: 16,
              borderTop: '1px solid #e5e7eb',
              borderBottom: '1px solid #e5e7eb',
              minHeight: 220,
              overflow: 'auto',
            }}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label="Writer rich text editor"
                  style={{
                    minHeight: 180,
                    outline: 'none',
                    whiteSpace: 'pre-wrap',
                    fontSize: 14,
                    lineHeight: 1.55,
                  }}
                />
              }
              placeholder={
                <div
                  style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    color: '#9ca3af',
                    fontSize: 14,
                  }}
                >
                  Type writer content here...
                </div>
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ErrorBoundary={LexicalErrorBoundary as React.ComponentType<any>}
            />
            <HistoryPlugin />
            <ListPlugin />
            <TablePlugin />
            <WriterClipboardPlugin
              documentFingerprint={element.documentFingerprint}
              onAssetsImported={(assets) => {
                pendingAssetsRef.current = [
                  ...pendingAssetsRef.current,
                  ...assets,
                ];
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: 12,
              background: '#f8fafc',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Ctrl+Enter saves. Escape cancels.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onCancel}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                style={primaryButtonStyle}
              >
                Save
              </button>
            </div>
          </div>
        </LexicalComposer>
      </div>
    </div>
  );
};

function WriterPopupToolbar(): React.JSX.Element {
  const [editor] = useLexicalComposerContext();

  return (
    <div
      aria-label="Writer editor toolbar"
      role="toolbar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 12,
        background: '#f8fafc',
      }}
    >
      <ToolbarButton
        label="Bold"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
      />
      <ToolbarButton
        label="Italic"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
      />
      <ToolbarButton
        label="Underline"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
      />
      <ToolbarButton
        label="Align Left"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
      />
      <ToolbarButton
        label="Align Center"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
      />
      <ToolbarButton
        label="Align Right"
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 10px',
        borderRadius: 6,
        border: '1px solid #cbd5e1',
        background: '#ffffff',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}

function EditorBridgePlugin({
  onEditor,
}: {
  onEditor: (editor: LexicalEditor) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);

  return null;
}

const primaryButtonStyle: React.CSSProperties = {
  height: 34,
  padding: '0 14px',
  borderRadius: 7,
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 34,
  padding: '0 14px',
  borderRadius: 7,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};
