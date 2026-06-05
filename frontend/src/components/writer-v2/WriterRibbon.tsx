import React from 'react';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
import {
  $getSelection,
  $isRangeSelection,
  $getRoot,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $createParagraphNode,
  type LexicalEditor,
  type TextFormatType,
} from 'lexical';
import { $patchStyleText, $getSelectionStyleValueForProperty, $setBlocksType } from '@lexical/selection';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { toggleHeading } from '@/core/writer-v2/lexical-nodes/headingHelpers';
import { insertTable } from '@/core/writer-v2/lexical-nodes/tableHelpers';
import {
  toggleBlockType,
  applyBlockStyle,
  getActiveBlockType,
  getBlockStyleValue,
  type WriterBlockType,
} from '@/core/writer-v2/lexical-nodes/blockHelpers';
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover';
import { RIBBON_FONT_FAMILIES } from '@/core/writer-v2/export/fontFamilyResolver';
import {
  Bold, Italic, Underline, Strikethrough,
  Superscript, Subscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  IndentIncrease, IndentDecrease,
  List, ListOrdered, ListTodo,
  Heading1, Heading2, Heading3,
  Quote, Code, Minus,
  Link, Unlink,
  Search,
  Image as ImageIcon, Table as TableIcon,
  Undo2, Redo2, RemoveFormatting,
  Check, X as XIcon,
} from 'lucide-react';
import { WriterFindReplacePanel } from './WriterFindReplacePanel';
import { WriterRichAuthoringStatus } from './WriterRichAuthoringStatus';
import { WriterRichBoxStyleControl } from './WriterRichBoxStyleControl';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { $createImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';
import { ensureRichTextEditing } from '@/core/writer-v2/ensureRichTextEditing';
import {
  $isTableCellNode,
  $insertTableRowAtSelection,
  $insertTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $deleteTableColumnAtSelection,
} from '@lexical/table';
import { $findMatchingParent } from '@lexical/utils';
import {
  useRichEditorCommandQueue,
  type PendingRichEditorCommand,
  type PendingElementFormat,
  type PendingListCommand,
} from '@/core/writer-v2/richEditorCommandQueue';


// Only Standard-14 mappable families - ensures the export is honest.
const FONT_FAMILIES = RIBBON_FONT_FAMILIES;
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const LINE_HEIGHTS: Array<{ label: string; value: string }> = [
  { label: 'Auto', value: '' },
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
  { label: '2.5', value: '2.5' },
];

const LETTER_SPACINGS: Array<{ label: string; value: string }> = [
  { label: 'Normal', value: 'normal' },
  { label: 'Tight', value: '-0.02em' },
  { label: 'Wide', value: '0.05em' },
  { label: 'Wider', value: '0.1em' },
];

const TEXT_TRANSFORMS: Array<{ label: string; value: string }> = [
  { label: 'None', value: 'none' },
  { label: 'UPPER', value: 'uppercase' },
  { label: 'lower', value: 'lowercase' },
  { label: 'Title', value: 'capitalize' },
];

export const WriterRibbon: React.FC = () => {
  const activeEditor = useActiveEditorStore((state) => state.activeEditor);
  const [activeFormats, setActiveFormats] = React.useState<Set<string>>(new Set());
  const [textColor, setTextColor] = React.useState('#111827');
  const [highlightColor, setHighlightColor] = React.useState('#ffffff');
  const [fontFamily, setFontFamily] = React.useState('Helvetica');
  const [fontSize, setFontSize] = React.useState(14);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [_isSubscript, _setIsSubscript] = React.useState(false);
  const [_isSuperscript, _setIsSuperscript] = React.useState(false);
  const [_isCode, _setIsCode] = React.useState(false);
  const [isInTable, setIsInTable] = React.useState(false);

  const [lineHeight, setLineHeight] = React.useState('');
  const [letterSpacing, setLetterSpacing] = React.useState('normal');
  const [textTransform, setTextTransform] = React.useState('none');

  // Lists & headings
  const [activeBlockType, setActiveBlockType] = React.useState<WriterBlockType | null>(null);
  const [wordCount, setWordCount] = React.useState(0);
  const [charCount, setCharCount] = React.useState(0);
  const [findReplaceOpen, setFindReplaceOpen] = React.useState(false);

  // Link state
  const [linkPopover, setLinkPopover] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [activeLink, setActiveLink] = React.useState(false);

  // Table insertion inline popover state
  const [tablePopover, setTablePopover] = React.useState(false);
  const [tableRows, setTableRows] = React.useState(3);
  const [tableCols, setTableCols] = React.useState(3);

  // Paragraph spacing popover state
  const [spacingPopover, setSpacingPopover] = React.useState(false);
  const [spaceBefore, setSpaceBefore] = React.useState(0);
  const [spaceAfter, setSpaceAfter] = React.useState(0);

  const documentFingerprint = useSessionStore((state) => state.documentKey) ?? '';

  // Track selection state updates in active editor
  React.useEffect(() => {
    if (!activeEditor) {
      return;
    }

    const checkSelection = () => {
      activeEditor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setActiveFormats(new Set());
          return;
        }

        const formats = new Set<string>();
        if (selection.hasFormat('bold')) formats.add('bold');
        if (selection.hasFormat('italic')) formats.add('italic');
        if (selection.hasFormat('underline')) formats.add('underline');
        if (selection.hasFormat('strikethrough')) formats.add('strikethrough');
        if (selection.hasFormat('superscript')) formats.add('superscript');
        if (selection.hasFormat('subscript')) formats.add('subscript');
        setActiveFormats(formats);

        try {
          setLetterSpacing($getSelectionStyleValueForProperty(selection, 'letter-spacing', 'normal'));
        } catch {
          setLetterSpacing('normal');
        }

        try {
          setTextTransform($getSelectionStyleValueForProperty(selection, 'text-transform', 'none'));
        } catch {
          setTextTransform('none');
        }

        try {
          const font = $getSelectionStyleValueForProperty(selection, 'font-family', 'Helvetica');
          setFontFamily(font.replace(/['"]/g, ''));
        } catch {
          setFontFamily('Helvetica');
        }

        try {
          const sizeStr = $getSelectionStyleValueForProperty(selection, 'font-size', '14px');
          const parsedSize = parseInt(sizeStr, 10);
          setFontSize(isNaN(parsedSize) ? 14 : parsedSize);
        } catch {
          setFontSize(14);
        }

        try {
          const color = $getSelectionStyleValueForProperty(selection, 'color', '#111827');
          setTextColor(color);
        } catch {
          setTextColor('#111827');
        }

        try {
          const bg = $getSelectionStyleValueForProperty(selection, 'background-color', '#ffffff');
          setHighlightColor(bg);
        } catch {
          setHighlightColor('#ffffff');
        }
      });

      // Document-wide word / character count
      activeEditor.getEditorState().read(() => {
        const fullText = $getRoot().getTextContent();
        setCharCount(fullText.length);
        const words = fullText.trim().match(/\S+/g);
        setWordCount(words ? words.length : 0);

        // Detect if cursor is inside a link node
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          // Formatting
          _setIsSubscript(sel.hasFormat('subscript'));
          _setIsSuperscript(sel.hasFormat('superscript'));
          _setIsCode(sel.hasFormat('code'));

          const node = sel.anchor.getNode();
        const parent = node.getParent();
        
        // Track if selection is inside a table
        const inTable = $isTableCellNode(node) || $findMatchingParent(node, $isTableCellNode) !== null;
        setIsInTable(inTable);
        
        const isLink = $isLinkNode(node) || $isLinkNode(parent);
        setActiveLink(isLink);
      } else {
        setActiveLink(false);
      }
    });

      // Block-level reads (own their own editor-state read internally)
      setActiveBlockType(getActiveBlockType(activeEditor));
      setLineHeight(getBlockStyleValue(activeEditor, 'line-height'));
    };

    checkSelection();
    return activeEditor.registerUpdateListener(() => {
      checkSelection();
    });
  }, [activeEditor]);

  const runWithFocusedEditor = React.useCallback((
    _label: string,
    operation: (editor: LexicalEditor) => void,
  ): void => {
    const editor = activeEditor;
    if (!editor) return;

    try {
      operation(editor);
    } catch (err) {
      console.error('[WriterRibbon]', err);
    }
  }, [activeEditor]);

  const runOrQueueRichCommand = React.useCallback(async (
    _label: string,
    command: PendingRichEditorCommand,
    immediate: (editor: LexicalEditor) => void,
  ): Promise<void> => {
    if (activeEditor) {
      runWithFocusedEditor(_label, immediate);
      return;
    }

    useRichEditorCommandQueue.getState().enqueue(command);
    await ensureRichTextEditing();
  }, [activeEditor, runWithFocusedEditor]);

  const runSmartTextFormat = React.useCallback((format: TextFormatType) => {
    void runOrQueueRichCommand(
      `formatText:${format}`,
      {
        type: 'formatText',
        format,
      },
      (editor) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
      },
    );
  }, [runOrQueueRichCommand]);

  const runSmartElementFormat = React.useCallback((format: PendingElementFormat) => {
    void runOrQueueRichCommand(
      `formatElement:${format}`,
      {
        type: 'formatElement',
        format,
      },
      (editor) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
      },
    );
  }, [runOrQueueRichCommand]);

  const runSmartListCommand = React.useCallback((command: PendingListCommand) => {
    void runOrQueueRichCommand(
      `list:${command}`,
      {
        type: 'list',
        command,
      },
      (editor) => {
        if (command === 'bullet') {
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        } else if (command === 'number') {
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        } else if (command === 'check') {
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        } else {
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        }
      },
    );
  }, [runOrQueueRichCommand]);

  const runSmartIndent = React.useCallback((direction: 'in' | 'out') => {
    void runOrQueueRichCommand(
      `indent:${direction}`,
      {
        type: direction === 'in' ? 'indent' : 'outdent',
      },
      (editor) => {
        editor.dispatchCommand(
          direction === 'in' ? INDENT_CONTENT_COMMAND : OUTDENT_CONTENT_COMMAND,
          undefined,
        );
      },
    );
  }, [runOrQueueRichCommand]);

  const runSmartTextStyle = React.useCallback((
    property: string,
    value: string,
  ) => {
    void runOrQueueRichCommand(
      `textStyle:${property}`,
      {
        type: 'applyTextStyle',
        property,
        value,
      },
      (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, {
              [property]: value,
            });
          }
        });
      },
    );
  }, [runOrQueueRichCommand]);

  const runSmartBlockStyle = React.useCallback((style: Record<string, string>) => {
    void runOrQueueRichCommand(
      `blockStyle:${Object.keys(style).join(',')}`,
      {
        type: 'applyBlockStyle',
        style,
      },
      (editor) => applyBlockStyle(editor, style),
    );
  }, [runOrQueueRichCommand]);

  const runSmartBlockType = React.useCallback((blockType: WriterBlockType) => {
    void runOrQueueRichCommand(
      `blockType:${blockType}`,
      {
        type: 'toggleBlockType',
        blockType,
      },
      (editor) => toggleBlockType(editor, blockType),
    );
  }, [runOrQueueRichCommand]);

  const applyFontFamily = (family: string) => {
    setFontFamily(family);
    runSmartTextStyle('font-family', family);
  };

  const applyFontSize = (size: number) => {
    setFontSize(size);
    runSmartTextStyle('font-size', `${size}px`);
  };

  const applyColor = (color: string) => {
    setTextColor(color);
    runSmartTextStyle('color', color);
  };

  const applyHighlightColor = (color: string) => {
    setHighlightColor(color);
    runSmartTextStyle('background-color', color);
  };

  const applyLineHeight = (value: string) => {
    setLineHeight(value);
    runSmartBlockStyle({ 'line-height': value });
  };

  const applyLetterSpacing = (value: string) => {
    setLetterSpacing(value);
    runSmartTextStyle('letter-spacing', value === 'normal' ? '' : value);
  };

  const applyTextTransform = (value: string) => {
    setTextTransform(value);
    runSmartTextStyle('text-transform', value === 'none' ? '' : value);
  };

  const applyParagraphSpacing = () => {
    runSmartBlockStyle({
      'margin-top': spaceBefore > 0 ? `${spaceBefore}px` : '',
      'margin-bottom': spaceAfter > 0 ? `${spaceAfter}px` : '',
    });
    setSpacingPopover(false);
  };

  const clearFormatting = () => {
    void runOrQueueRichCommand(
      'clearFormatting',
      {
        type: 'clearFormatting',
      },
      (editor) => {
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
          ] as TextFormatType[]).forEach((fmt) => {
            if (selection.hasFormat(fmt)) {
              selection.formatText(fmt);
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
      },
    );
  };

  const openLinkPopover = () => {
    if (!activeEditor) return;
    // Pre-populate with existing link URL if cursor is inside one.
    activeEditor.getEditorState().read(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) {
        const node = sel.anchor.getNode();
        const parent = node.getParent();
        const linkNode = $isLinkNode(node) ? node : $isLinkNode(parent) ? parent : null;
        setLinkUrl(linkNode ? linkNode.getURL() : '');
      }
    });
    setLinkPopover(true);
  };

  const applyLink = () => {
    if (!activeEditor) return;
    const url = linkUrl.trim();
    const safeUrl = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : null;
    activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, safeUrl);
    setLinkPopover(false);
    setLinkUrl('');
  };

  const removeLink = () => {
    if (!activeEditor) return;
    activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setLinkPopover(false);
  };

  const handleInsertTable = () => {
    setTablePopover(true);
  };

  const confirmInsertTable = () => {
    const rows = Math.max(1, Math.min(50, tableRows));
    const cols = Math.max(1, Math.min(20, tableCols));
    void runOrQueueRichCommand(
      `insertTable:${rows}x${cols}`,
      {
        type: 'insertTable',
        rows,
        cols,
      },
      (editor) => insertTable(editor, rows, cols),
    );
    setTablePopover(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const asset: WriterAssetRecordV2 = {
        id: 'asset_' + Math.random().toString(36).substring(2, 11),
        documentFingerprint,
        kind: 'image',
        mimeType: file.type,
        dataUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useWriterV2Store.getState().addWriterAssets([asset]);

      const editingId = useWriterV2Store.getState().editingId;
      const elements = useWriterV2Store.getState().elements;
      const editingElement = elements.find((el) => el.id === editingId);
      if (editingElement) {
        useWriterV2Store.getState().dispatchWriterCommand({
          type: 'UPDATE_WRITER_ELEMENT',
          id: editingElement.id,
          now: new Date().toISOString(),
          patch: { assetIds: [...(editingElement.assetIds ?? []), asset.id] },
        });
      }

      void runOrQueueRichCommand(
        'insertImage',
        {
          type: 'insertImage',
          src: dataUrl,
          altText: file.name,
        },
        (editor) => {
          editor.focus(() => {
            editor.update(() => {
              const selection = $getSelection();
              const imageNode = $createImageNode(dataUrl, file.name);
              if ($isRangeSelection(selection)) {
                selection.insertNodes([imageNode]);
              } else {
                $getRoot().append(imageNode);
              }
            });
          });
        },
      );
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const hasActive = !!activeEditor;

  // Ctrl+H / Cmd+H - toggle Find & Replace (only when an editor is active)
  React.useEffect(() => {
    if (!hasActive) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        e.stopPropagation();
        setFindReplaceOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [hasActive]);

  return (
    <div
      data-writer-ribbon="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '4px',
        padding: '4px 12px',
        background: '#ffffff',
        borderBottom: '1px solid #cbd5e1',
        minHeight: '34px',
        position: 'relative',
      }}
      className="dark:bg-slate-900 dark:border-slate-800"
    >
      <WriterRichAuthoringStatus />
      <WriterRichBoxStyleControl />

      {/* Group 1: Undo / Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Undo (Ctrl+Z)"
          icon={<Undo2 size={13} />}
          disabled={!hasActive}
          onClick={() => activeEditor?.dispatchCommand(UNDO_COMMAND, undefined)}
        />
        <RibbonBtn
          label="Redo (Ctrl+Y)"
          icon={<Redo2 size={13} />}
          disabled={!hasActive}
          onClick={() => activeEditor?.dispatchCommand(REDO_COMMAND, undefined)}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 2: Font Selection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <select
          aria-label="Font Family"
          value={fontFamily}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => applyFontFamily(e.target.value)}
          disabled={!documentFingerprint}
          style={{
            height: '26px',
            borderRadius: '5px',
            border: '1px solid #cbd5e1',
            fontSize: '11px',
            background: '#ffffff',
            cursor: documentFingerprint ? 'pointer' : 'not-allowed',
            padding: '0 4px',
            width: '110px',
            opacity: documentFingerprint ? 1 : 0.5,
          }}
          className="dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200"
        >
          {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          aria-label="Font Size"
          value={fontSize}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => applyFontSize(Number(e.target.value))}
          disabled={!documentFingerprint}
          style={{
            height: '26px',
            borderRadius: '5px',
            border: '1px solid #cbd5e1',
            fontSize: '11px',
            background: '#ffffff',
            cursor: documentFingerprint ? 'pointer' : 'not-allowed',
            padding: '0 4px',
            width: '46px',
            opacity: documentFingerprint ? 1 : 0.5,
          }}
          className="dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200"
        >
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <div style={{ opacity: documentFingerprint ? 1 : 0.5, pointerEvents: documentFingerprint ? 'auto' : 'none', display: 'flex', gap: '4px' }}>
          <ColorPickerPopover value={textColor} onChange={applyColor} label="Text" />
          <ColorPickerPopover value={highlightColor} onChange={applyHighlightColor} label="Highlight" />
        </div>
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 3: Style Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Bold (Ctrl+B)"
          icon={<Bold size={13} />}
          active={activeFormats.has('bold')}
          onClick={() => runSmartTextFormat('bold')}
        />
        <RibbonBtn
          label="Italic (Ctrl+I)"
          icon={<Italic size={13} />}
          active={activeFormats.has('italic')}
          onClick={() => runSmartTextFormat('italic')}
        />
        <RibbonBtn
          label="Underline (Ctrl+U)"
          icon={<Underline size={13} />}
          active={activeFormats.has('underline')}
          onClick={() => runSmartTextFormat('underline')}
        />
        <RibbonBtn
          label="Strikethrough"
          icon={<Strikethrough size={13} />}
          active={activeFormats.has('strikethrough')}
          onClick={() => runSmartTextFormat('strikethrough')}
        />
        <RibbonBtn
          label="Superscript"
          icon={<Superscript size={13} />}
          active={activeFormats.has('superscript')}
          onClick={() => runSmartTextFormat('superscript')}
        />
        <RibbonBtn
          label="Subscript"
          icon={<Subscript size={13} />}
          active={activeFormats.has('subscript')}
          onClick={() => runSmartTextFormat('subscript')}
        />
        <RibbonBtn
          label="Clear formatting"
          icon={<RemoveFormatting size={13} />}
          onClick={clearFormatting}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 4: Headings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Heading 1"
          icon={<Heading1 size={13} />}
          onClick={() => {
            void runOrQueueRichCommand(
              'applyHeading:h1',
              { type: 'applyHeading', level: 1 },
              (editor) => toggleHeading(editor, 'h1'),
            );
          }}
        />
        <RibbonBtn
          label="Heading 2"
          icon={<Heading2 size={13} />}
          onClick={() => {
            void runOrQueueRichCommand(
              'applyHeading:h2',
              { type: 'applyHeading', level: 2 },
              (editor) => toggleHeading(editor, 'h2'),
            );
          }}
        />
        <RibbonBtn
          label="Heading 3"
          icon={<Heading3 size={13} />}
          onClick={() => {
            void runOrQueueRichCommand(
              'applyHeading:h3',
              { type: 'applyHeading', level: 3 },
              (editor) => toggleHeading(editor, 'h3'),
            );
          }}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 5: Alignment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Align Left"
          icon={<AlignLeft size={13} />}
          onClick={() => runSmartElementFormat('left')}
        />
        <RibbonBtn
          label="Align Center"
          icon={<AlignCenter size={13} />}
          onClick={() => runSmartElementFormat('center')}
        />
        <RibbonBtn
          label="Align Right"
          icon={<AlignRight size={13} />}
          onClick={() => runSmartElementFormat('right')}
        />
        <RibbonBtn
          label="Justify"
          icon={<AlignJustify size={13} />}
          onClick={() => runSmartElementFormat('justify')}
        />
        <RibbonBtn
          label="Outdent"
          icon={<IndentDecrease size={13} />}
          onClick={() => runSmartIndent('out')}
        />
        <RibbonBtn
          label="Indent"
          icon={<IndentIncrease size={13} />}
          onClick={() => runSmartIndent('in')}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 6: Lists */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Bullet list"
          icon={<List size={13} />}
          onClick={() => runSmartListCommand('bullet')}
        />
        <RibbonBtn
          label="Numbered list"
          icon={<ListOrdered size={13} />}
          onClick={() => runSmartListCommand('number')}
        />
        <RibbonBtn
          label="Checklist"
          icon={<ListTodo size={13} />}
          onClick={() => runSmartListCommand('check')}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group: Blocks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <RibbonBtn
          label="Blockquote"
          icon={<Quote size={13} />}
          active={activeBlockType === 'quote'}
          onClick={() => runSmartBlockType('quote')}
        />
        <RibbonBtn
          label="Code block"
          icon={<Code size={13} />}
          active={activeBlockType === 'code'}
          onClick={() => runSmartBlockType('code')}
        />
        <RibbonBtn
          label="Horizontal rule"
          icon={<Minus size={13} />}
          onClick={() => {
            void runOrQueueRichCommand(
              'horizontalRule',
              { type: 'horizontalRule' },
              (editor: LexicalEditor) => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
            );
          }}
        />
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group: Spacing & transform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
        <RibbonBtn
          label="Typography & Spacing"
          icon={<span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>¶</span>}
          active={spacingPopover}
          disabled={!documentFingerprint}
          onClick={() => setSpacingPopover((v) => !v)}
        />

        {spacingPopover && (
          <div
            data-color-picker-popover="true"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 50,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '12px 14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 200,
            }}
            className="dark:bg-slate-900 dark:border-slate-700"
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Typography
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Line height
                <select
                  value={lineHeight}
                  onChange={(e) => applyLineHeight(e.target.value)}
                  style={{ width: 80, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11, background: '#fff' }}
                >
                  {LINE_HEIGHTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Letter spacing
                <select
                  value={letterSpacing}
                  onChange={(e) => applyLetterSpacing(e.target.value)}
                  style={{ width: 80, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11, background: '#fff' }}
                >
                  {LETTER_SPACINGS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Text transform
                <select
                  value={textTransform}
                  onChange={(e) => applyTextTransform(e.target.value)}
                  style={{ width: 80, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11, background: '#fff' }}
                >
                  {TEXT_TRANSFORMS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ height: 1, background: '#cbd5e1' }} />

            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Paragraph Spacing (px)
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                Before
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={spaceBefore}
                  onChange={(e) => setSpaceBefore(Math.max(0, Number(e.target.value)))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11 }}
                />
              </label>
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                After
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={spaceAfter}
                  onChange={(e) => setSpaceAfter(Math.max(0, Number(e.target.value)))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={applyParagraphSpacing}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5,
                  padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setSpacingPopover(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1',
                  borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group: Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
        <RibbonBtn
          label={activeLink ? 'Edit link' : 'Insert link'}
          icon={<Link size={13} />}
          active={activeLink}
          disabled={!hasActive}
          onClick={openLinkPopover}
        />
        {activeLink && (
          <RibbonBtn
            label="Remove link"
            icon={<Unlink size={13} />}
            disabled={!hasActive}
            onClick={removeLink}
          />
        )}

        {linkPopover && (
          <div
            data-color-picker-popover="true"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '10px 12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 260,
            }}
            className="dark:bg-slate-900 dark:border-slate-700"
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
              Insert / Edit Link
            </div>
            <input
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                if (e.key === 'Escape') { e.preventDefault(); setLinkPopover(false); }
              }}
              autoFocus
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                width: '100%',
                boxSizing: 'border-box',
              }}
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={applyLink}
                disabled={!linkUrl.trim()}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5,
                  padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  opacity: linkUrl.trim() ? 1 : 0.5,
                }}
              >
                <Check size={11} /> Apply
              </button>
              <button
                type="button"
                onClick={() => setLinkPopover(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1',
                  borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                <XIcon size={11} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />

      {/* Group 7: Inserts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
        <RibbonBtn
          label="Insert table"
          icon={<TableIcon size={13} />}
          active={tablePopover}
          onClick={handleInsertTable}
        />
        <RibbonBtn
          label="Insert image"
          icon={<ImageIcon size={13} />}
          onClick={() => fileInputRef.current?.click()}
        />

        {/* Inline table size picker */}
        {tablePopover && (
          <div
            data-color-picker-popover="true"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '10px 12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 180,
            }}
            className="dark:bg-slate-900 dark:border-slate-700"
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
              Insert Table
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', flexDirection: 'column', gap: 2 }}>
                Rows
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tableRows}
                  onChange={(e) => setTableRows(Number(e.target.value))}
                  style={{
                    width: 56,
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 12,
                  }}
                />
              </label>
              <label style={{ fontSize: 11, color: '#374151', display: 'flex', flexDirection: 'column', gap: 2 }}>
                Cols
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableCols}
                  onChange={(e) => setTableCols(Number(e.target.value))}
                  style={{
                    width: 56,
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 12,
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={confirmInsertTable}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <Check size={11} /> Insert
              </button>
              <button
                type="button"
                onClick={() => setTablePopover(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  background: 'transparent',
                  color: '#64748b',
                  border: '1px solid #cbd5e1',
                  borderRadius: 5,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <XIcon size={11} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Group 8: Table Operations (Dynamic) */}
      {isInTable && (
        <>
          <div style={{ width: 1, height: 18, background: '#cbd5e1', margin: '0 4px' }} className="dark:bg-slate-800" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Table</span>
            <RibbonBtn
              label="Add Row"
              icon={<span style={{ fontSize: '11px', fontWeight: 600 }}>+ Row</span>}
              onClick={() => runWithFocusedEditor('insertTableRow', (editor) => {
                editor.update(() => {
                  $insertTableRowAtSelection(false);
                });
              })}
            />
            <RibbonBtn
              label="Delete Row"
              icon={<span style={{ fontSize: '11px', fontWeight: 600 }}>- Row</span>}
              onClick={() => runWithFocusedEditor('deleteTableRow', (editor) => {
                editor.update(() => {
                  $deleteTableRowAtSelection();
                });
              })}
            />
            <RibbonBtn
              label="Add Column"
              icon={<span style={{ fontSize: '11px', fontWeight: 600 }}>+ Col</span>}
              onClick={() => runWithFocusedEditor('insertTableColumn', (editor) => {
                editor.update(() => {
                  $insertTableColumnAtSelection(false);
                });
              })}
            />
            <RibbonBtn
              label="Delete Column"
              icon={<span style={{ fontSize: '11px', fontWeight: 600 }}>- Col</span>}
              onClick={() => runWithFocusedEditor('deleteTableColumn', (editor) => {
                editor.update(() => {
                  $deleteTableColumnAtSelection();
                });
              })}
            />
          </div>
        </>
      )}

      {/* Find & Replace */}
      <div style={{ position: 'relative', marginLeft: 'auto' }}>
        <RibbonBtn
          label="Find & Replace (Ctrl+H)"
          icon={<Search size={13} />}
          active={findReplaceOpen}
          disabled={!hasActive}
          onClick={() => setFindReplaceOpen((v) => !v)}
        />
        {findReplaceOpen && (
          <WriterFindReplacePanel onClose={() => setFindReplaceOpen(false)} />
        )}
      </div>

      {/* Word / character count */}
      <div
        aria-label="Word and character count"
        title={`${wordCount} words, ${charCount} characters`}
        style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: '#64748b',
          whiteSpace: 'nowrap',
          padding: '0 6px',
          userSelect: 'none',
        }}
        className="dark:text-slate-400"
      >
        {hasActive ? `${wordCount} words · ${charCount} chars` : ''}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
        aria-label="Upload inline image from ribbon"
      />
    </div>
  );
};


const RibbonBtn: React.FC<{
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, icon, active = false, disabled = false, onClick }) => {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      style={{
        width: '26px',
        height: '26px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '5px',
        border: active ? '1px solid #2563eb' : '1px solid transparent',
        background: active ? '#dbeafe' : 'transparent',
        color: active ? '#1d4ed8' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s ease',
      }}
      className="dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
    >
      {icon}
    </button>
  );
};
