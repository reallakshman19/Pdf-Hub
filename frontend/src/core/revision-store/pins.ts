import type {
  RevisionRuntimePin,
} from './reachability';

interface RegisteredRevisionPin
extends RevisionRuntimePin {
  token: number;
}

let nextToken = 1;
const pins =
  new Map<
    number,
    RegisteredRevisionPin
  >();

export interface RevisionPinHandle {
  readonly storeId: string;
  readonly revisionId: string;
  readonly reason: string;
  release(): void;
}

/**
 * Process-local liveness pin for asynchronous consumers that must keep an
 * immutable revision available while reference-aware GC may run.
 */
export function acquireRevisionPin(
  storeId: string,
  revisionId: string,
  reason: string,
): RevisionPinHandle {
  if (
    !storeId.trim()
    || !revisionId.trim()
    || !reason.trim()
  ) {
    throw new Error(
      'Revision pins require non-empty storeId, revisionId and reason.',
    );
  }

  const token = nextToken++;
  pins.set(token, {
    token,
    storeId,
    revisionId,
    reason,
  });

  let released = false;
  return Object.freeze({
    storeId,
    revisionId,
    reason,
    release() {
      if (released) return;
      released = true;
      pins.delete(token);
    },
  });
}

export function listRevisionPins(
  storeId?: string,
): RevisionRuntimePin[] {
  return [...pins.values()]
    .filter(
      (pin) =>
        !storeId
        || pin.storeId === storeId,
    )
    .map(({ storeId: id, revisionId, reason }) => ({
      storeId: id,
      revisionId,
      reason,
    }))
    .sort(
      (left, right) =>
        left.storeId.localeCompare(
          right.storeId,
        )
        || left.revisionId.localeCompare(
          right.revisionId,
        )
        || left.reason.localeCompare(
          right.reason,
        ),
    );
}

/** Test-only reset for process-local liveness pins. */
export function clearRevisionPinsForTests(): void {
  pins.clear();
  nextToken = 1;
}
