import type { PdfPoint, PdfRect, WriterElementV2 } from './types';

export type WriterElementPatch = Partial<
  Omit<
    WriterElementV2,
    | 'id'
    | 'documentFingerprint'
    | 'createdAt'
  >
>;

export type WriterCommand =
  | {
      type: 'ADD_WRITER_ELEMENT';
      element: WriterElementV2;
    }
  | {
      type: 'UPDATE_WRITER_ELEMENT';
      id: string;
      patch: WriterElementPatch;
      now?: string;
    }
  | {
      type: 'DELETE_WRITER_ELEMENT';
      id: string;
    }
  | {
      type: 'MOVE_WRITER_ELEMENT';
      id: string;
      dx: number;
      dy: number;
      pageBounds?: PdfRect;
      now?: string;
    }
  | {
      type: 'RESIZE_WRITER_ELEMENT';
      id: string;
      rect: PdfRect;
      pageBounds?: PdfRect;
      now?: string;
    }
  | {
      type: 'LOCK_WRITER_ELEMENT';
      id: string;
      locked: boolean;
      now?: string;
    }
  | {
      type: 'HIDE_WRITER_ELEMENT';
      id: string;
      hidden: boolean;
      now?: string;
    }
  | {
      type: 'SET_WRITER_Z_INDEX';
      id: string;
      zIndex: number;
      now?: string;
    }
  | {
      type: 'BRING_WRITER_FORWARD';
      id: string;
      now?: string;
    }
  | {
      type: 'SEND_WRITER_BACKWARD';
      id: string;
      now?: string;
    }
  | {
      type: 'BRING_WRITER_TO_FRONT';
      id: string;
      now?: string;
    }
  | {
      type: 'SEND_WRITER_TO_BACK';
      id: string;
      now?: string;
    }
  | {
      type: 'SET_ACTIVE_WRITER_ELEMENT';
      id: string | null;
    }
  | {
      type: 'SET_WRITER_SELECTION';
      ids: string[];
    }
  | {
      type: 'CLEAR_WRITER_SELECTION';
    }
  | {
      type: 'BATCH_ADD_WRITER_ELEMENTS';
      elements: WriterElementV2[];
      selectAll?: boolean;
    }
  | {
      type: 'BATCH_DELETE_WRITER_ELEMENTS';
      ids: string[];
    };

export function isMutationCommand(command: WriterCommand): boolean {
  return command.type !== 'SET_ACTIVE_WRITER_ELEMENT'
    && command.type !== 'SET_WRITER_SELECTION'
    && command.type !== 'CLEAR_WRITER_SELECTION';
}

export function commandTimestamp(command: WriterCommand): string {
  return 'now' in command && command.now
    ? command.now
    : new Date().toISOString();
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function normalizeZIndex(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function normalizePdfRectForCommand(rect: PdfRect): PdfRect {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);

  return {
    x: x1,
    y: y1,
    width: Math.max(1, x2 - x1),
    height: Math.max(1, y2 - y1),
  };
}

export function clampRectToBounds(rect: PdfRect, bounds?: PdfRect): PdfRect {
  const normalized = normalizePdfRectForCommand(rect);

  if (!bounds) {
    return normalized;
  }

  const cleanBounds = normalizePdfRectForCommand(bounds);
  const width = Math.min(normalized.width, cleanBounds.width);
  const height = Math.min(normalized.height, cleanBounds.height);

  return {
    x: clamp(normalized.x, cleanBounds.x, cleanBounds.x + cleanBounds.width - width),
    y: clamp(normalized.y, cleanBounds.y, cleanBounds.y + cleanBounds.height - height),
    width,
    height,
  };
}

export function moveRect(rect: PdfRect, delta: PdfPoint, bounds?: PdfRect): PdfRect {
  return clampRectToBounds(
    {
      ...rect,
      x: rect.x + delta.x,
      y: rect.y + delta.y,
    },
    bounds,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
