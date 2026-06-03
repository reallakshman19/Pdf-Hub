import type { LexicalEditor, ElementNode } from 'lexical';
import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $createParagraphNode,
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text';
import { $createCodeNode, $isCodeNode } from '@lexical/code';

export type WriterBlockType = 'quote' | 'code';

/**
 * Toggle the top-level block type of the current selection between a paragraph
 * and the requested type (quote or code). If the selection is already the
 * target type, it is converted back to a paragraph.
 */
export function toggleBlockType(editor: LexicalEditor, type: WriterBlockType): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const element = selection.anchor.getNode().getTopLevelElement();
    const isActive =
      type === 'quote' ? $isQuoteNode(element) : $isCodeNode(element);

    if (isActive) {
      $setBlocksType(selection, () => $createParagraphNode());
      return;
    }

    $setBlocksType(selection, () =>
      type === 'quote' ? $createQuoteNode() : $createCodeNode(),
    );
  });
}

/**
 * Apply block-level CSS (e.g. line-height, margin-top/bottom) to every
 * top-level element node covered by the current selection. Pass an empty string
 * as a value to remove that property.
 */
export function applyBlockStyle(
  editor: LexicalEditor,
  styles: Record<string, string>,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const topLevels = new Set<ElementNode>();
    const addTop = (node: ReturnType<typeof selection.anchor.getNode>) => {
      const top = node.getTopLevelElement();
      if (top && $isElementNode(top)) topLevels.add(top);
    };

    addTop(selection.anchor.getNode());
    addTop(selection.focus.getNode());
    selection.getNodes().forEach(addTop);

    topLevels.forEach((el) => {
      el.setStyle(mergeStyle(el.getStyle(), styles));
    });
  });
}

/** Read a block-level style value from the selection's anchor top-level element. */
export function getBlockStyleValue(
  editor: LexicalEditor,
  property: string,
): string {
  let value = '';
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const el = selection.anchor.getNode().getTopLevelElement();
    if (el && $isElementNode(el)) {
      value = parseStyle(el.getStyle()).get(property) ?? '';
    }
  });
  return value;
}

/** Returns the active block type ('quote' | 'code' | null) for the selection. */
export function getActiveBlockType(editor: LexicalEditor): WriterBlockType | null {
  let result: WriterBlockType | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const el = selection.anchor.getNode().getTopLevelElement();
    if ($isQuoteNode(el)) result = 'quote';
    else if ($isCodeNode(el)) result = 'code';
  });
  return result;
}

function parseStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  (style || '').split(';').forEach((part) => {
    const idx = part.indexOf(':');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key && val) map.set(key, val);
  });
  return map;
}

function mergeStyle(existing: string, patch: Record<string, string>): string {
  const map = parseStyle(existing);
  Object.entries(patch).forEach(([key, value]) => {
    if (value === '') map.delete(key);
    else map.set(key, value);
  });
  return Array.from(map.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}
