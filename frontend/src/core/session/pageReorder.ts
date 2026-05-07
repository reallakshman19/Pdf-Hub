export function calculateNewPageOrder(
  pageCount: number,
  selectedPages: number[],
  targetPage: number,
  placement: 'before' | 'after' | 'append'
): number[] {
  // Normalize 1-based indices
  const allPages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const selectedSet = new Set(selectedPages);
  
  // Filter out out-of-bounds selected pages
  const validSelected = selectedPages.filter(p => p >= 1 && p <= pageCount);
  
  if (validSelected.length === 0) {
    return allPages;
  }

  // Remove selected pages from the original list
  const remainingPages = allPages.filter(p => !selectedSet.has(p));

  // Determine the insertion index in the remaining pages list
  let insertIndex = remainingPages.length;

  if (placement !== 'append') {
    const targetIndex = remainingPages.indexOf(targetPage);
    if (targetIndex !== -1) {
      insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
    }
  }

  // Insert the selected pages at the calculated index
  const newOrder = [
    ...remainingPages.slice(0, insertIndex),
    ...validSelected,
    ...remainingPages.slice(insertIndex)
  ];

  return newOrder;
}
