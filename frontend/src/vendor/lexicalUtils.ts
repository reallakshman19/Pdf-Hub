import type { LexicalNode } from 'lexical';

export function $findMatchingParent(
  node: LexicalNode,
  predicate: (node: LexicalNode) => boolean,
): LexicalNode | null {
  let parent = node.getParent();

  while (parent !== null) {
    if (predicate(parent)) {
      return parent;
    }

    parent = parent.getParent();
  }

  return null;
}
