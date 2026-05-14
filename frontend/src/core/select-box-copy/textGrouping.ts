import type {
  SelectBoxTextItem,
  SelectBoxTextRow,
} from './types';

export function groupTextItemsIntoRows(
  items: SelectBoxTextItem[],
): SelectBoxTextRow[] {
  if (items.length === 0) return [];

  const sorted = items
    .slice()
    .sort((a, b) => {
      const ay = verticalCenter(a);
      const by = verticalCenter(b);

      if (Math.abs(ay - by) > 3) return ay - by;
      return a.x - b.x;
    });

  const medianHeight = median(sorted.map((item) => item.height)) || 10;
  const tolerance = Math.max(4, medianHeight * 0.55);
  const rows: SelectBoxTextItem[][] = [];

  for (const item of sorted) {
    const center = verticalCenter(item);
    const row = rows.find((candidate) => {
      const candidateCenter = median(candidate.map(verticalCenter));
      return Math.abs(candidateCenter - center) <= tolerance;
    });

    if (row) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }

  return rows
    .map((rowItems) => {
      const ordered = rowItems.slice().sort((a, b) => a.x - b.x);
      const top = Math.min(...ordered.map((item) => item.y));
      const bottom = Math.max(...ordered.map((item) => item.y + item.height));

      return {
        y: top,
        height: bottom - top,
        items: ordered,
        text: joinRowText(ordered),
      };
    })
    .sort((a, b) => a.y - b.y);
}

export function rowsToPlainText(rows: SelectBoxTextRow[]): string {
  return rows
    .map((row) => row.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function joinRowText(items: SelectBoxTextItem[]): string {
  if (items.length === 0) return '';

  const medianSpace = Math.max(4, median(items.map((item) => item.fontSize)) * 0.35);
  let output = '';

  for (const [index, item] of items.entries()) {
    if (index === 0) {
      output += item.text;
      continue;
    }

    const previous = items[index - 1];
    const gap = item.x - (previous.x + previous.width);

    output += gap > medianSpace ? ` ${item.text}` : item.text;
  }

  return output.replace(/\s+/g, ' ').trim();
}

function verticalCenter(item: SelectBoxTextItem): number {
  return item.y + item.height / 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}