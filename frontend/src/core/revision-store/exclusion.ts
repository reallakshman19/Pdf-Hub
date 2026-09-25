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
    options: {
      mode: 'exclusive' | 'shared';
      ifAvailable?: boolean;
    },
    callback: (
      lock: unknown | null,
    ) => Promise<T> | T,
  ): Promise<T>;
};

type NavigatorWithLocks = Navigator & {
  locks?: RevisionLockManager;
};

const localExclusiveTails =
  new Map<string, Promise<void>>();

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

export class RevisionStoreGcBlockedError
extends Error {
  readonly storeId: string;

  constructor(storeId: string) {
    super(
      `Revision GC is blocked by an active session without persistent journal coverage for store ${storeId}.`,
    );
    this.name =
      'RevisionStoreGcBlockedError';
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

export function revisionStoreGcBlockerLockName(
  storeId: string,
): string {
  if (!storeId.trim()) {
    throw new Error(
      'Revision GC blocker requires a non-empty store id.',
    );
  }
  return `pdf-hub:revision-store-gc-blocker:${encodeURIComponent(storeId)}`;
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
    (globalThis.navigator as NavigatorWithLocks | undefined)?.locks;

  if (!lockManager?.request) {
    if (input.requireCrossContext) {
      throw new RevisionStoreLockUnavailableError(
        input.storeId,
      );
    }
    return acquireLocalExclusiveLease(
      input.storeId,
    );
  }

  const lease =
    await acquireWebLockLease({
      storeId: input.storeId,
      lockManager,
      name,
      mode: 'exclusive',
    });
  if (!lease) {
    throw new Error(
      `Exclusive revision store lock ${name} was unexpectedly unavailable.`,
    );
  }
  return lease;
}


export async function acquireRevisionStoreGcBlockerLease(
  storeId: string,
): Promise<RevisionStoreExclusiveLease> {
  const lockManager =
    (globalThis.navigator as NavigatorWithLocks | undefined)?.locks;

  if (!lockManager?.request) {
    return noOpLease(storeId);
  }

  const lease =
    await acquireWebLockLease({
      storeId,
      lockManager,
      name:
        revisionStoreGcBlockerLockName(
          storeId,
        ),
      mode: 'shared',
    });
  if (!lease) {
    throw new Error(
      'Shared revision GC blocker lock was unexpectedly unavailable.',
    );
  }
  return lease;
}

/**
 * GC calls this only while already holding the main revision-store exclusive
 * lease. ifAvailable avoids waiting forever on another tab whose active
 * session is intentionally blocking collection.
 */
export async function acquireRevisionStoreGcClearanceLease(
  storeId: string,
): Promise<RevisionStoreExclusiveLease> {
  const lockManager =
    (globalThis.navigator as NavigatorWithLocks | undefined)?.locks;
  if (!lockManager?.request) {
    throw new RevisionStoreLockUnavailableError(
      storeId,
    );
  }

  const lease =
    await acquireWebLockLease({
      storeId,
      lockManager,
      name:
        revisionStoreGcBlockerLockName(
          storeId,
        ),
      mode: 'exclusive',
      ifAvailable: true,
    });

  if (!lease) {
    throw new RevisionStoreGcBlockedError(
      storeId,
    );
  }
  return lease;
}

async function acquireWebLockLease(input: {
  storeId: string;
  lockManager: RevisionLockManager;
  name: string;
  mode: 'exclusive' | 'shared';
  ifAvailable?: boolean;
}): Promise<RevisionStoreExclusiveLease | null> {
  let releaseGate!: () => void;
  const gate = new Promise<void>(
    (resolve) => {
      releaseGate = resolve;
    },
  );

  let resolveAcquired!:
    (
      value:
        RevisionStoreExclusiveLease
        | null,
    ) => void;
  let rejectAcquired!:
    (error: unknown) => void;
  const acquired = new Promise<
    RevisionStoreExclusiveLease | null
  >((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });

  let released = false;
  const request = input.lockManager
    .request(
      input.name,
      {
        mode: input.mode,
        ...(input.ifAvailable
          ? { ifAvailable: true }
          : {}),
      },
      async (lock) => {
        if (
          input.ifAvailable
          && lock === null
        ) {
          resolveAcquired(null);
          return;
        }

        resolveAcquired(
          Object.freeze({
            storeId: input.storeId,
            crossContext: true,
            release() {
              if (released) return;
              released = true;
              releaseGate();
            },
          }),
        );
        await gate;
      },
    )
    .catch((error) => {
      rejectAcquired(error);
      throw error;
    });

  try {
    const lease = await acquired;
    void request.catch(
      () => undefined,
    );
    return lease;
  } catch (error) {
    void request.catch(
      () => undefined,
    );
    throw error;
  }
}


async function acquireLocalExclusiveLease(
  storeId: string,
): Promise<RevisionStoreExclusiveLease> {
  const prior =
    localExclusiveTails.get(storeId)
    ?? Promise.resolve();

  let releaseGate!: () => void;
  const gate = new Promise<void>(
    (resolve) => {
      releaseGate = resolve;
    },
  );
  const tail = prior
    .catch(() => undefined)
    .then(() => gate);
  localExclusiveTails.set(
    storeId,
    tail,
  );

  await prior.catch(() => undefined);

  let released = false;
  return Object.freeze({
    storeId,
    crossContext: false,
    release() {
      if (released) return;
      released = true;
      releaseGate();
      void tail.finally(() => {
        if (
          localExclusiveTails.get(
            storeId,
          ) === tail
        ) {
          localExclusiveTails.delete(
            storeId,
          );
        }
      });
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
