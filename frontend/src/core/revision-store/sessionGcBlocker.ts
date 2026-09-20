import type {
  RevisionStoreExclusiveLease,
} from './exclusion';

let activeSessionBlocker:
  RevisionStoreExclusiveLease | null =
    null;

/**
 * One PDF Hub tab owns at most one active document session. A persistent
 * revision session without persistent journal coverage installs a shared
 * cross-context blocker here so another tab's GC cannot collect its bytes.
 */
export function installActiveSessionRevisionGcBlocker(
  blocker:
    RevisionStoreExclusiveLease | null,
): void {
  if (activeSessionBlocker === blocker) {
    return;
  }
  activeSessionBlocker?.release();
  activeSessionBlocker = blocker;
}

export function releaseActiveSessionRevisionGcBlocker(): void {
  installActiveSessionRevisionGcBlocker(
    null,
  );
}

/** Test-only visibility. */
export function hasActiveSessionRevisionGcBlockerForTests(): boolean {
  return activeSessionBlocker !== null;
}
