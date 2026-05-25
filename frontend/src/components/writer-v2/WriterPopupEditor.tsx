import React from 'react';
import ReactDOM from 'react-dom';
import type { EditorState, LexicalEditor } from 'lexical';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
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
import { $patchStyleText } from '@lexical/selection';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover';
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from 'lucide-react';

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
      namespace: `writer-v2-${element.id}`,
      nodes: [
        ListNode,
        ListItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      editorState: initialEditorStateJson,
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
  }, [element.id, initialEditorStateJson]);

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

  // Catch Escape/Ctrl+Enter at document level in capture phase.
  // Lexical calls stopPropagation on keydown inside ContentEditable, so
  // relying on the backdrop's onKeyDown bubbling is unreliable.
  // Capture phase fires BEFORE Lexical's bubble-phase handler.
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

  // Render via portal so the dialog escapes the WriterOverlayLayer's z-index:12
  // stacking context — otherwise position:fixed + z-index:2000 is still beaten
  // by root-level elements like the Inspector panel (z-index:200).
  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit writer element ${element.id}`}
      onClick={(event) => {
        // Close if user clicks the dim backdrop (not the dialog card itself)
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15, 23, 42, 0.38)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        data-writer-v2-popup-editor="true"
        style={{
          width: 'min(760px, calc(100vw - 48px))',
          maxHeight: 'min(560px, calc(100vh - 48px))',
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
        <LexicalComposer key={composerKey} initialConfig={initialConfig}>
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
              position: 'relative',
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
    </div>,
    document.body,
  );
};

const FONT_FAMILIES = ['Inter', 'IBM Plex Sans', 'Georgia', 'Arial', 'Times New Roman', 'Courier New'];
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

function WriterPopupToolbar(): React.JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [activeFormats, setActiveFormats] = React.useState<Set<string>>(new Set());
  const [textColor, setTextColor] = React.useState('#111827');

  React.useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) { setActiveFormats(new Set()); return; }
        const formats = new Set<string>();
        if (selection.hasFormat('bold')) formats.add('bold');
        if (selection.hasFormat('italic')) formats.add('italic');
        if (selection.hasFormat('underline')) formats.add('underline');
        if (selection.hasFormat('strikethrough')) formats.add('strikethrough');
        setActiveFormats(formats);
      });
    });
  }, [editor]);

  const applyFontFamily = (family: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { 'font-family': family });
    });
  };

  const applyFontSize = (size: number) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { 'font-size': `${size}px` });
    });
  };

  const applyColor = (color: string) => {
    setTextColor(color);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { color });
    });
  };

  const divider = (
    <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
  );

  return (
    <div
      aria-label="Writer editor toolbar"
      role="toolbar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        padding: '8px 12px',
        background: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      {/* Group 1: Font */}
      <select
        onChange={(e) => applyFontFamily(e.target.value)}
        defaultValue="Inter"
        style={selectStyle}
        title="Font family"
      >
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>

      <select
        onChange={(e) => applyFontSize(Number(e.target.value))}
        defaultValue={14}
        style={{ ...selectStyle, width: 52 }}
        title="Font size"
      >
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <ColorPickerPopover value={textColor} onChange={applyColor} />

      {divider}

      {/* Group 2: Style */}
      <FormatBtn label="Bold" icon={<Bold size={13} />} active={activeFormats.has('bold')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <FormatBtn label="Italic" icon={<Italic size={13} />} active={activeFormats.has('italic')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <FormatBtn label="Underline" icon={<Underline size={13} />} active={activeFormats.has('underline')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <FormatBtn label="Strikethrough" icon={<Strikethrough size={13} />} active={activeFormats.has('strikethrough')}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} />

      {divider}

      {/* Group 3: Alignment */}
      <FormatBtn label="Align Left" icon={<AlignLeft size={13} />}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')} />
      <FormatBtn label="Align Center" icon={<AlignCenter size={13} />}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')} />
      <FormatBtn label="Align Right" icon={<AlignRight size={13} />}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')} />

      {divider}

      {/* Group 4: Lists */}
      <FormatBtn label="Bullet list" icon={<List size={13} />}
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <FormatBtn label="Numbered list" icon={<ListOrdered size={13} />}
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
    </div>
  );
}

function FormatBtn({ label, icon, active = false, onClick }: {
  label: string; icon: React.ReactNode; active?: boolean; onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      title={label}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 5,
        border: active ? '1px solid #2563eb' : '1px solid transparent',
        background: active ? '#dbeafe' : 'transparent',
        color: active ? '#1d4ed8' : '#374151',
        cursor: 'pointer',
      }}
    >
      {icon}
    </button>
  );
}

const selectStyle: React.CSSProperties = {
  height: 28,
  borderRadius: 5,
  border: '1px solid #e2e8f0',
  fontSize: 11,
  background: '#ffffff',
  cursor: 'pointer',
  padding: '0 4px',
  width: 120,
};

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
