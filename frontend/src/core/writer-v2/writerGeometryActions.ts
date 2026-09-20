import type { PdfRect } from './types';
import { useWriterV2Store } from './writerV2Store';
import type { WriterSelectionActionResult } from './writerSelectionActions';

export interface WriterGeometryPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const MIN_GEOMETRY_SIZE = 12;

export async function updateActiveWriterElementGeometry(
  patch: WriterGeometryPatch,
): Promise<WriterSelectionActionResult> {
  const store = useWriterV2Store.getState();
  const id =
    store.activeId
    ?? store.selectedIds.at(-1)
    ?? null;

  if (!id || store.selectedIds.length !== 1) {
    return {
      changed: false,
      ids: [],
      message:
        'Select exactly one Writer V2 element to edit geometry.',
    };
  }

  const current = store.elements.find(
    (candidate) => candidate.id === id,
  );

  if (
    !current
    || current.locked
    || current.hidden
  ) {
    return {
      changed: false,
      ids: [id],
      message:
        'Selected Writer V2 element geometry cannot be edited.',
    };
  }

  const result =
    await store.dispatchWriterCommandDurableLatest(
      (state) => {
        const element = state.elements.find(
          (candidate) =>
            candidate.id === id,
        );

        if (
          !element
          || element.locked
          || element.hidden
        ) {
          return null;
        }

        const rect =
          normalizeWriterGeometryRect(
            {
              x:
                patch.x
                ?? element.rect.x,
              y:
                patch.y
                ?? element.rect.y,
              width:
                patch.width
                ?? element.rect.width,
              height:
                patch.height
                ?? element.rect.height,
            },
            getPageBoundsForElement(
              element.pageIndex,
            ),
          );

        return {
          type: 'UPDATE_WRITER_ELEMENT',
          id,
          patch: {
            rect,
          },
        };
      },
    );

  return {
    changed: result.changed,
    ids: [id],
    message: result.changed
      ? 'Updated Writer V2 element geometry.'
      : result.reason,
  };
}


export function normalizeWriterGeometryRect(
  rect: PdfRect,
  pageBounds?: { width: number; height: number } | null,
): PdfRect {
  const width = finiteOr(rect.width, MIN_GEOMETRY_SIZE);
  const height = finiteOr(rect.height, MIN_GEOMETRY_SIZE);
  const normalizedWidth = Math.max(MIN_GEOMETRY_SIZE, width);
  const normalizedHeight = Math.max(MIN_GEOMETRY_SIZE, height);
  const maxX = pageBounds ? Math.max(0, pageBounds.width - normalizedWidth) : Number.POSITIVE_INFINITY;
  const maxY = pageBounds ? Math.max(0, pageBounds.height - normalizedHeight) : Number.POSITIVE_INFINITY;

  return {
    x: clamp(finiteOr(rect.x, 0), 0, maxX),
    y: clamp(finiteOr(rect.y, 0), 0, maxY),
    width: pageBounds ? Math.min(normalizedWidth, pageBounds.width) : normalizedWidth,
    height: pageBounds ? Math.min(normalizedHeight, pageBounds.height) : normalizedHeight,
  };
}

function getPageBoundsForElement(pageIndex: number): { width: number; height: number } | null {
  const meta = useWriterV2Store.getState().documentMeta;

  if (!meta || meta.mode !== 'blankDocument' || pageIndex < 0 || pageIndex >= meta.pageCount) {
    return null;
  }

  return {
    width: meta.pageSetup.width,
    height: meta.pageSetup.height,
  };
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
