import type {
  WriterRichTextBlock,
  WriterRichTextBlockType,
  WriterRichTextModel,
  WriterTextRun,
} from './types';
import {
  createTextRun,
} from './content-model';

export interface RichTextSelectionRef {
  blockIndex: number;
  runIndex?: number;
}

export function updateRichTextPlainText(
  model: WriterRichTextModel,
  text: string,
): WriterRichTextModel {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');

  return {
    ...model,
    blocks: lines.map((line, index) => {
      const existing = model.blocks[index];

      return {
        id: existing?.id ?? `block-${index + 1}`,
        type: existing?.type ?? 'paragraph',
        align: existing?.align ?? 'left',
        level: existing?.level,
        runs: [
          {
            ...(existing?.runs[0] ?? createTextRun('')),
            text: line,
          },
        ],
      };
    }),
  };
}

export function setBlockType(
  model: WriterRichTextModel,
  blockIndex: number,
  type: WriterRichTextBlockType,
): WriterRichTextModel {
  return updateBlock(model, blockIndex, (block) => ({
    ...block,
    type,
    level: type === 'heading' ? block.level ?? 2 : undefined,
  }));
}

export function setBlockAlign(
  model: WriterRichTextModel,
  blockIndex: number,
  align: WriterRichTextBlock['align'],
): WriterRichTextModel {
  return updateBlock(model, blockIndex, (block) => ({
    ...block,
    align,
  }));
}

export function setHeadingLevel(
  model: WriterRichTextModel,
  blockIndex: number,
  level: 1 | 2 | 3,
): WriterRichTextModel {
  return updateBlock(model, blockIndex, (block) => ({
    ...block,
    type: 'heading',
    level,
  }));
}

export function toggleRunMark(
  model: WriterRichTextModel,
  ref: RichTextSelectionRef,
  mark: 'bold' | 'italic' | 'underline' | 'strike',
): WriterRichTextModel {
  return updateRun(model, ref, (run) => ({
    ...run,
    [mark]: !run[mark],
  }));
}

export function setRunColor(
  model: WriterRichTextModel,
  ref: RichTextSelectionRef,
  color: string,
): WriterRichTextModel {
  return updateRun(model, ref, (run) => ({
    ...run,
    color,
  }));
}

export function setRunFontSize(
  model: WriterRichTextModel,
  ref: RichTextSelectionRef,
  fontSize: number,
): WriterRichTextModel {
  return updateRun(model, ref, (run) => ({
    ...run,
    fontSize: Math.max(1, fontSize),
  }));
}

export function setRunFontFamily(
  model: WriterRichTextModel,
  ref: RichTextSelectionRef,
  fontFamily: string,
): WriterRichTextModel {
  return updateRun(model, ref, (run) => ({
    ...run,
    fontFamily,
  }));
}

export function insertBlockAfter(
  model: WriterRichTextModel,
  blockIndex: number,
  text = '',
): WriterRichTextModel {
  const blocks = [...model.blocks];

  blocks.splice(blockIndex + 1, 0, {
    id: `block-${Date.now().toString(36)}`,
    type: 'paragraph',
    align: 'left',
    runs: [createTextRun(text)],
  });

  return {
    ...model,
    blocks,
  };
}

export function removeBlock(
  model: WriterRichTextModel,
  blockIndex: number,
): WriterRichTextModel {
  const blocks = model.blocks.filter((_, index) => index !== blockIndex);

  return {
    ...model,
    blocks: blocks.length > 0
      ? blocks
      : [
          {
            id: `block-${Date.now().toString(36)}`,
            type: 'paragraph',
            align: 'left',
            runs: [createTextRun('')],
          },
        ],
  };
}

export function mergeAdjacentRuns(model: WriterRichTextModel): WriterRichTextModel {
  return {
    ...model,
    blocks: model.blocks.map((block) => ({
      ...block,
      runs: mergeRuns(block.runs),
    })),
  };
}

function updateBlock(
  model: WriterRichTextModel,
  blockIndex: number,
  updater: (block: WriterRichTextBlock) => WriterRichTextBlock,
): WriterRichTextModel {
  return {
    ...model,
    blocks: model.blocks.map((block, index) =>
      index === blockIndex ? updater(block) : block,
    ),
  };
}

function updateRun(
  model: WriterRichTextModel,
  ref: RichTextSelectionRef,
  updater: (run: WriterTextRun) => WriterTextRun,
): WriterRichTextModel {
  return updateBlock(model, ref.blockIndex, (block) => ({
    ...block,
    runs: block.runs.map((run, index) =>
      index === (ref.runIndex ?? 0) ? updater(run) : run,
    ),
  }));
}

function mergeRuns(runs: WriterTextRun[]): WriterTextRun[] {
  const merged: WriterTextRun[] = [];

  for (const run of runs) {
    const previous = merged[merged.length - 1];

    if (previous && sameRunStyle(previous, run)) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }

  return merged;
}

function sameRunStyle(a: WriterTextRun, b: WriterTextRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.color === b.color &&
    a.backgroundColor === b.backgroundColor &&
    a.fontSize === b.fontSize &&
    a.fontFamily === b.fontFamily &&
    a.superscript === b.superscript &&
    a.subscript === b.subscript
  );
}
