import React, { useMemo, useState } from 'react';
import type {
  PlacedElement,
  WriterRichTextModel,
} from '@/core/writer/types';
import {
  createEmptyRichTextModel,
} from '@/core/writer/content-model';
import {
  richTextModelToHtml,
  richTextModelToPlainText,
} from '@/core/writer/richTextHtml';
import {
  setBlockAlign,
  setBlockType,
  setRunColor,
  setRunFontFamily,
  setRunFontSize,
  toggleRunMark,
  updateRichTextPlainText,
} from '@/core/writer/richTextCommands';
import {
  syncElementContentFromModel,
} from '@/core/writer/content-serialization';

export interface RichTextEditorPanelProps {
  element: PlacedElement;
  onChange: (element: PlacedElement) => void;
  onClose?: () => void;
}

export const RichTextEditorPanel: React.FC<RichTextEditorPanelProps> = ({
  element,
  onChange,
  onClose,
}) => {
  const initialModel = useMemo(() => {
    if (element.contentModel?.kind === 'rich-text') return element.contentModel;
    return createEmptyRichTextModel(element.content ?? '');
  }, [element]);

  const [model, setModel] = useState<WriterRichTextModel>(initialModel);
  const [selectedBlock, setSelectedBlock] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);

  const selectedRunRef = {
    blockIndex: Math.max(0, Math.min(selectedBlock, model.blocks.length - 1)),
    runIndex: 0,
  };

  const commit = (nextModel: WriterRichTextModel) => {
    setModel(nextModel);
    onChange(
      syncElementContentFromModel({
        ...element,
        type: 'rich-text',
        contentModel: nextModel,
      }),
    );
  };

  const plainText = richTextModelToPlainText(model);

  return (
    <div
      className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      data-writer-allow-native-paste="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 p-3">
        <div>
          <div className="text-sm font-semibold">Rich Text Editor</div>
          <div className="text-xs text-slate-500">
            {model.blocks.length} block(s)
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
            onClick={() => setPreviewMode((value) => !value)}
          >
            {previewMode ? 'Edit' : 'Preview'}
          </button>

          {onClose && (
            <button
              type="button"
              className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 p-3">
        <ToolbarButton onClick={() => commit(toggleRunMark(model, selectedRunRef, 'bold'))}>
          Bold
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(toggleRunMark(model, selectedRunRef, 'italic'))}>
          Italic
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(toggleRunMark(model, selectedRunRef, 'underline'))}>
          Underline
        </ToolbarButton>
        <ToolbarButton onClick={() => commit(toggleRunMark(model, selectedRunRef, 'strike'))}>
          Strike
        </ToolbarButton>

        <select
          value={model.blocks[selectedRunRef.blockIndex]?.type ?? 'paragraph'}
          onChange={(event) =>
            commit(setBlockType(model, selectedRunRef.blockIndex, event.target.value as never))
          }
          className="h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
        >
          <option value="paragraph">Paragraph</option>
          <option value="heading">Heading</option>
          <option value="bullet">Bullet</option>
          <option value="numbered">Numbered</option>
          <option value="quote">Quote</option>
        </select>

        <select
          value={model.blocks[selectedRunRef.blockIndex]?.align ?? 'left'}
          onChange={(event) =>
            commit(setBlockAlign(model, selectedRunRef.blockIndex, event.target.value as never))
          }
          className="h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>

        <input
          type="number"
          min={6}
          max={96}
          defaultValue={12}
          onChange={(event) =>
            commit(setRunFontSize(model, selectedRunRef, Number(event.target.value) || 12))
          }
          className="h-8 w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
          title="Font size"
        />

        <input
          type="color"
          defaultValue="#111827"
          onChange={(event) => commit(setRunColor(model, selectedRunRef, event.target.value))}
          className="h-8 w-12 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-1"
          title="Text color"
        />

        <select
          defaultValue="Arial"
          onChange={(event) => commit(setRunFontFamily(model, selectedRunRef, event.target.value))}
          className="h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
        >
          <option value="Arial">Arial</option>
          <option value="Calibri">Calibri</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
        </select>
      </div>

      <div className="grid grid-cols-[160px_1fr] min-h-[320px]">
        <div className="border-r border-slate-200 dark:border-slate-800 p-2 overflow-auto">
          {model.blocks.map((block, index) => (
            <button
              key={block.id}
              type="button"
              className={[
                'w-full text-left rounded px-2 py-1 text-xs mb-1',
                selectedBlock === index
                  ? 'bg-blue-100 dark:bg-blue-950'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-900',
              ].join(' ')}
              onClick={() => setSelectedBlock(index)}
            >
              {index + 1}. {block.type}
            </button>
          ))}
        </div>

        <div className="p-3">
          {previewMode ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: richTextModelToHtml(model) }}
            />
          ) : (
            <textarea
              value={plainText}
              onChange={(event) => commit(updateRichTextPlainText(model, event.target.value))}
              className="h-80 w-full resize-none rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm"
              data-writer-allow-native-paste="true"
            />
          )}
        </div>
      </div>
    </div>
  );
};

function ToolbarButton(props: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
