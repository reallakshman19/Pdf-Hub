import type { LexicalEditor } from 'lexical';
import { $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical';
import { $createHeadingNode, HeadingNode, type HeadingTagType } from '@lexical/rich-text';

/**
 * Toggle heading level for the current selection.
 * If already at the target level, convert back to paragraph.
 */
export function toggleHeading(
  editor: LexicalEditor,
  level: HeadingTagType,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    const element = anchorNode.getTopLevelElementOrThrow();

    if (element instanceof HeadingNode && element.getTag() === level) {
      // Already this heading — convert back to paragraph
      const paragraph = $createParagraphNode();
      element.getChildren().forEach((child) => paragraph.append(child));
      element.replace(paragraph);
    } else {
      // Convert to heading
      const heading = $createHeadingNode(level);
      element.getChildren().forEach((child) => heading.append(child));
      element.replace(heading);
    }
  });
}

/** Re-export for editor config registration */
export { HeadingNode };
