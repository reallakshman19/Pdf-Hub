import type { LexicalEditor } from 'lexical';
import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import {
  $createHeadingNode,
  $isHeadingNode,
  HeadingNode,
  type HeadingTagType,
} from '@lexical/rich-text';

/**
 * Toggles the selected block between a heading level and a paragraph.
 * If no range selection is active (e.g., the editor has focus but no caret
 * was placed), selects the first paragraph as a fallback so the command
 * always has something to act on.
 */
export function toggleHeading(
  editor: LexicalEditor,
  level: HeadingTagType,
): void {
  editor.update(() => {
    let selection = $getSelection();

    // Fallback: no range selection — select the root's first child
    if (!$isRangeSelection(selection)) {
      const root = $getRoot();
      const first = root.getFirstChild();
      if (first) {
        first.selectStart();
        selection = $getSelection();
      }
    }

    if (!$isRangeSelection(selection)) return;

    const element = selection.anchor.getNode().getTopLevelElementOrThrow();
    const isActiveHeading = $isHeadingNode(element) && element.getTag() === level;

    $setBlocksType(selection, () =>
      isActiveHeading ? $createParagraphNode() : $createHeadingNode(level),
    );
  });
}

export { HeadingNode };

