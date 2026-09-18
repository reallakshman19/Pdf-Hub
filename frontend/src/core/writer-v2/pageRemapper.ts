import { v4 as uuidv4 } from 'uuid';

import type { PdfRect, WriterElementV2 } from './types';

function cloneElement(
  element: WriterElementV2,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    ...element,
    ...patch,
    rect: {
      ...element.rect,
      ...(patch.rect ?? {}),
    },
    style: {
      ...element.style,
      ...(patch.style ?? {}),
    },
  };
}

export function remapWriterAfterReorder(
  elements: WriterElementV2[],
  order: number[],
): WriterElementV2[] {
  const oldToNew = new Array<number>(order.length);
  order.forEach((oldIndex, newIndex) => {
    oldToNew[oldIndex] = newIndex;
  });

  return elements.map((element) => {
    const nextPageIndex = oldToNew[element.pageIndex];
    return nextPageIndex === undefined
      ? element
      : cloneElement(element, { pageIndex: nextPageIndex });
  });
}

export function remapWriterAfterDelete(
  elements: WriterElementV2[],
  deletedIndices: number[],
): WriterElementV2[] {
  if (deletedIndices.length === 0) return elements;

  const deleted = new Set(deletedIndices);
  const sorted = Array.from(deleted).sort((a, b) => a - b);

  return elements
    .filter((element) => !deleted.has(element.pageIndex))
    .map((element) => {
      const shift = sorted.filter((index) => index < element.pageIndex).length;
      return shift === 0
        ? element
        : cloneElement(element, { pageIndex: element.pageIndex - shift });
    });
}

export function remapWriterAfterInsert(
  elements: WriterElementV2[],
  atIndex: number,
  count: number,
): WriterElementV2[] {
  if (count <= 0) return elements;

  return elements.map((element) =>
    element.pageIndex >= atIndex
      ? cloneElement(element, { pageIndex: element.pageIndex + count })
      : element,
  );
}

export function remapWriterAfterDuplicate(
  elements: WriterElementV2[],
  pageIndices: number[],
  options: {
    createId?: () => string;
    now?: string;
  } = {},
): WriterElementV2[] {
  if (pageIndices.length === 0) return elements;

  const duplicated = Array.from(new Set(pageIndices)).sort((a, b) => a - b);
  const createId = options.createId ?? uuidv4;
  const now = options.now ?? new Date().toISOString();

  const shifted = elements.map((element) => {
    const insertedBefore = duplicated.filter(
      (index) => index < element.pageIndex,
    ).length;

    return insertedBefore === 0
      ? element
      : cloneElement(element, {
          pageIndex: element.pageIndex + insertedBefore,
        });
  });

  const copies: WriterElementV2[] = [];

  duplicated.forEach((originalPageIndex, duplicateOrder) => {
    const duplicatePageIndex = originalPageIndex + duplicateOrder + 1;

    for (const element of elements) {
      if (element.pageIndex !== originalPageIndex) continue;
      copies.push(
        cloneElement(element, {
          id: createId(),
          pageIndex: duplicatePageIndex,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  });

  return [...shifted, ...copies];
}

export function remapWriterAfterRotate(
  elements: WriterElementV2[],
  rotations: Array<{
    pageIndex: number;
    angle: number;
    width: number;
    height: number;
  }>,
): WriterElementV2[] {
  if (rotations.length === 0) return elements;

  const rotationMap = new Map(
    rotations.map((rotation) => [rotation.pageIndex, rotation]),
  );

  return elements.map((element) => {
    const rotation = rotationMap.get(element.pageIndex);
    if (!rotation) return element;

    const angle = ((rotation.angle % 360) + 360) % 360;
    if (angle === 0) return element;

    return cloneElement(element, {
      rect: rotateRect(
        element.rect,
        angle,
        rotation.width,
        rotation.height,
      ),
      updatedAt: new Date().toISOString(),
    });
  });
}

function rotateRect(
  rect: PdfRect,
  angle: number,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  if (angle === 90) {
    return {
      x: pageHeight - (rect.y + rect.height),
      y: rect.x,
      width: rect.height,
      height: rect.width,
    };
  }

  if (angle === 180) {
    return {
      x: pageWidth - (rect.x + rect.width),
      y: pageHeight - (rect.y + rect.height),
      width: rect.width,
      height: rect.height,
    };
  }

  if (angle === 270) {
    return {
      x: rect.y,
      y: pageWidth - (rect.x + rect.width),
      width: rect.height,
      height: rect.width,
    };
  }

  return rect;
}
