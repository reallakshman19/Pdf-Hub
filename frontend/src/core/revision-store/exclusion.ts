export interface RevisionStoreExclusiveLease {
  readonly storeId: string;
  readonly crossContext: boolean;
  release(): void;
}

export interface AcquireRevisionStoreExclusiveLeaseInput {
  storeId: string;
  /**
   * Persistent destructive operations must require Web Locks so another tab
   * cannot publish a revision while collection is deriving reachability.
   */
  requireCrossContext?: boolean;
}

type RevisionLockManager = {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T> | T,
  ): Promise<T>;
};

type NavigatorWithLocks = Navigator & {
  locks?: RevisionLockManager;
};

export class RevisionStoreLockUnavailableError
extends Error {
  readonly storeId: string;

  constructor(storeId: string) {
    super(
      `Cross-context locking is unavailable for persistent revision store ${storeId}.`,
    );
    this.name =
      'RevisionStoreLockUnavailableError';
    this.storeId = storeId;
  }
}

export function revisionStoreExclusiveLockName(
  storeId: string,
): string {
  if (!storeId.trim()) {
    throw new Error(
      'Revision store lock requires a non-empty store id.',
    );
  }
  return `pdf-hub:revision-store:${encodeURIComponent(storeId)}`;
}

/**
 * Acquire one exclusive revision-store lease.
 *
 * Writers participate opportunistically when Web Locks exists. Persistent GC
 * requires cross-context locking and therefore fails closed when Web Locks is
 * unavailable. The callback passed to navigator.locks remains pending until
 * release(), so the lease can span revision publication plus journal commit.
 */
export async function acquireRevisionStoreExclusiveLease(
  input:
    AcquireRevisionStoreExclusiveLeaseInput,
): Promise<RevisionStoreExclusiveLease> {
  const name =
    revisionStoreExclusiveLockName(
      input.storeId,
    );
  const lockManager =
    (
      globalThis.navigator
        as NavigatorWithLocks
        | undefined
    )?.locks;

  if (!lockManager?.request) {
    if (input.requireCrossContext) {
      throw new RevisionStoreLockUnavailableError(
        input.storeId,
      );
    }
    return noOpLease(input.storeId);
  }

  let releaseGate!: () => void;
  const gate = new Promise<void>(
    (resolve) => {
      releaseGate = resolve;
    },
  );

  let resolveAcquired!: () => void;
  let rejectAcquired!:
    (error: unknown) => void;
  const acquired = new Promise<void>(
    (resolve, reject) => {
      resolveAcquired = resolve;
      rejectAcquired = reject;
    },
  );

  const request = lockManager
    .request(
      name,
      { mode: 'exclusive' },
      async () => {
        resolveAcquired();
        await gate;
      },
    )
    .catch((error) => {
      rejectAcquired(error);
      throw error;
    });

  try {
    await acquired;
  } catch (error) {
    void request.catch(() => undefined);
    throw error;
  }

  let released = false;
  void request.catch(() => undefined);

  return Object.freeze({
    storeId: input.storeId,
    crossContext: true,
    release() {
      if (released) return;
      released = true;
      releaseGate();
    },
  });
}

function noOpLease(
  storeId: string,
): RevisionStoreExclusiveLease {
  let released = false;
  return Object.freeze({
    storeId,
    crossContext: false,
    release() {
      if (released) return;
      released = true;
    },
  });
}
