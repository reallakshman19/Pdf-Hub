import React from 'react';
import type { EditorState, LexicalEditor, TextFormatType } from 'lexical';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { $patchStyleText, $setBlocksType } from '@lexical/selection';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { ListNode, ListItemNode } from '@lexical/list';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { QuoteNode, type HeadingTagType, $createHeadingNode } from '@lexical/rich-text';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { HorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import {
  $createImageNode,
  ImageNode,
} from '@/core/writer-v2/lexical-nodes/ImageNode';
import {
  HeadingNode,
  toggleHeading,
} from '@/core/writer-v2/lexical-nodes/headingHelpers';
import { insertTable } from '@/core/writer-v2/lexical-nodes/tableHelpers';
import {
  applyBlockStyle,
  toggleBlockType,
} from '@/core/writer-v2/lexical-nodes/blockHelpers';
import { useRichEditorCommandQueue } from '@/core/writer-v2/richEditorCommandQueue';
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
        LinkNode,
        AutoLinkNode,
      ],
      editorState: initialEditorStateJson,
      theme: {
        paragraph: 'writer-v2-editor-paragraph',
        quote: 'writer-v2-editor-quote',
        code: 'writer-v2-editor-code',
        link: 'writer-v2-editor-link',
        heading: {
          h1: 'writer-v2-editor-h1',
          h2: 'writer-v2-editor-h2',
          h3: 'writer-v2-editor-h3',
          h4: 'writer-v2-editor-h4',
          h5: 'writer-v2-editor-h5',
          h6: 'writer-v2-editor-h6',
        },
        list: {
          listitemChecked: 'writer-v2-editor-listitem-checked',
          listitemUnchecked: 'writer-v2-editor-listitem-unchecked',
          ul: 'writer-v2-editor-ul',
          ol: 'writer-v2-editor-ol',
          listitem: 'writer-v2-editor-listitem',
          nested: {
            listitem: 'writer-v2-editor-nested-listitem',
          },
        },
        table: 'writer-v2-editor-table',
        tableCell: 'writer-v2-editor-table-cell',
        tableCellHeader: 'writer-v2-editor-table-cell-header',
        tableRow: 'writer-v2-editor-table-row',
        tableSelected: 'writer-v2-editor-table-selected',
        tableCellSelected: 'writer-v2-editor-table-cell-selected',
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
        overflow: 'auto',
      }}
    >
      <LexicalComposer key={composerKey} initialConfig={initialConfig}>
        <ActiveEditorRegisterPlugin
          onEditor={(editor) => {
            editorRef.current = editor;
            // Focus the editor after registration so the user can type immediately
            // without needing an extra click.
            requestAnimationFrame(() => {
              editor.focus();
            });
          }}
        />
        <QueuedRichEditorCommandPlugin />

        <OnChangePlugin
          onChange={(editorState) => {
            latestStateRef.current = editorState;
          }}
        />

        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Writer rich text inline editor"
              autoFocus
              style={{
                width: '100%',
                minHeight: '100%',
                outline: 'none',
                // Do NOT set whiteSpace:pre-wrap here — it breaks <table> rendering
                // inside Lexical. Block-level nodes (paragraphs, headings, tables)
                // control their own whitespace. Text nodes inside them inherit
                // correctly without this override.
                fontSize: 'inherit',
                fontFamily: 'inherit',
                lineHeight: 'inherit',
                color: 'inherit',
                overflow: 'auto',
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
        <LinkPlugin validateUrl={(url) => /^https?:\/\//i.test(url)} />
        <CheckListPlugin />
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

function QueuedRichEditorCommandPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const pendingCount = useRichEditorCommandQueue((state) => state.pending.length);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const commands = useRichEditorCommandQueue.getState().drain();

      if (commands.length === 0) {
        return;
      }

      editor.focus(() => {
        for (const command of commands) {
          switch (command.type) {
            case 'insertTable':
              insertTable(editor, command.rows, command.cols);
              break;

            case 'insertImage':
              editor.update(() => {
                $insertNodes([
                  $createImageNode(
                    command.src,
                    command.altText,
                    command.width,
                    command.height,
                    command.caption,
                  ),
                ]);
              });
              break;

            case 'applyHeading':
              toggleHeading(editor, `h${command.level}` as HeadingTagType);
              break;

            case 'formatText':
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, command.format);
              break;

            case 'formatElement':
              editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, command.format);
              break;

            case 'indent':
              editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
              break;

            case 'outdent':
              editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
              break;

            case 'list':
              if (command.command === 'bullet') {
                editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
              } else if (command.command === 'number') {
                editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
              } else if (command.command === 'check') {
                editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
              } else {
                editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
              }
              break;

            case 'horizontalRule':
              editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
              break;

            case 'applyTextStyle':
              editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                  $patchStyleText(selection, {
                    [command.property]: command.value,
                  });
                }
              });
              break;

            case 'applyBlockStyle':
              applyBlockStyle(editor, command.style);
              break;

            case 'toggleBlockType':
              toggleBlockType(editor, command.blockType);
              break;

            case 'clearFormatting':
              clearEditorFormatting(editor);
              break;

            case 'insertTemplateSnippet':
              editor.update(() => {
                const nodes = command.blocks.map((block) => {
                  const node = block.kind === 'heading'
                    ? $createHeadingNode(levelToTag(block.level ?? 2))
                    : $createParagraphNode();

                  if (block.text) {
                    const textNode = $createTextNode(block.text);

                    if (block.style) {
                      textNode.setStyle(block.style);
                    }

                    node.append(textNode);
                  }

                  return node;
                });

                $insertNodes(nodes);
              });
              break;

            case 'focus':
              break;
          }
        }
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editor, pendingCount]);

  return null;
}

function levelToTag(level: 1 | 2 | 3): HeadingTagType {
  return `h${level}` as HeadingTagType;
}

function clearEditorFormatting(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    ([
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'superscript',
      'subscript',
      'code',
    ] as TextFormatType[]).forEach((format) => {
      if (selection.hasFormat(format)) {
        selection.formatText(format);
      }
    });

    $patchStyleText(selection, {
      color: '',
      'background-color': '',
      'font-size': '',
      'font-family': '',
      'letter-spacing': '',
      'line-height': '',
      'text-transform': '',
    });

    $setBlocksType(selection, () => $createParagraphNode());
  });

  editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
}

