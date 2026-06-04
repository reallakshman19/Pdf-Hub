import type { LexicalEditor } from 'lexical';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import {
  $createHeadingNode,
  $isHeadingNode,
  HeadingNode,
  type HeadingTagType,
} from '@lexical/rich-text';

/**
 * Toggles the selected block between a heading level and a paragraph.
 * Expects a mounted Lexical editor with an active range selection; returns no
 * output and does not apply a fallback when the selection is unavailable.
 */
export function toggleHeading(
  editor: LexicalEditor,
  level: HeadingTagType,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const element = selection.anchor.getNode().getTopLevelElementOrThrow();
    const isActiveHeading = $isHeadingNode(element) && element.getTag() === level;

    $setBlocksType(selection, () =>
      isActiveHeading ? $createParagraphNode() : $createHeadingNode(level),
    );
  });
}

export { HeadingNode };
