import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  acquireRevisionStoreExclusiveLease,
  acquireRevisionStoreGcBlockerLease,
  acquireRevisionStoreGcClearanceLease,
  RevisionStoreGcBlockedError,
  RevisionStoreLockUnavailableError,
  revisionStoreExclusiveLockName,
  revisionStoreGcBlockerLockName,
} from '../exclusion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(
  'revision store exclusion',
  () => {
    it('serializes local writers when Web Locks is unavailable', async () => {
      vi.stubGlobal(
        'navigator',
        {},
      );

      const first =
        await acquireRevisionStoreExclusiveLease({
          storeId: 'store-a',
        });
      let secondAcquired = false;
      const secondPromise =
        acquireRevisionStoreExclusiveLease({
          storeId: 'store-a',
        }).then((lease) => {
          secondAcquired = true;
          return lease;
        });

      await Promise.resolve();
      expect(secondAcquired)
        .toBe(false);

      first.release();
      const second =
        await secondPromise;
      expect(secondAcquired)
        .toBe(true);
      second.release();
    });

    it('requires origin-wide locking before persistent destructive work', async () => {
      vi.stubGlobal(
        'navigator',
        {},
      );

      await expect(
        acquireRevisionStoreExclusiveLease({
          storeId:
            'persistent-store',
          requireCrossContext: true,
        }),
      ).rejects.toBeInstanceOf(
        RevisionStoreLockUnavailableError,
      );
    });

    it('uses deterministic Web Lock names and marks acquired leases cross-context', async () => {
      const requests:
        Array<{
          name: string;
          mode: string;
          ifAvailable?: boolean;
        }> = [];
      vi.stubGlobal(
        'navigator',
        {
          locks: {
            request(
              name: string,
              options: {
                mode: string;
                ifAvailable?: boolean;
              },
              callback:
                (lock: unknown) =>
                  unknown,
            ) {
              requests.push({
                name,
                ...options,
              });
              return Promise.resolve(
                callback({ name }),
              );
            },
          },
        },
      );

      const writer =
        await acquireRevisionStoreExclusiveLease({
          storeId: 'store/a',
          requireCrossContext: true,
        });
      const blocker =
        await acquireRevisionStoreGcBlockerLease(
          'store/a',
        );

      expect(writer.crossContext)
        .toBe(true);
      expect(blocker.crossContext)
        .toBe(true);
      expect(requests).toEqual([
        {
          name:
            revisionStoreExclusiveLockName(
              'store/a',
            ),
          mode: 'exclusive',
        },
        {
          name:
            revisionStoreGcBlockerLockName(
              'store/a',
            ),
          mode: 'shared',
        },
      ]);

      blocker.release();
      writer.release();
    });

    it('fails fast when an unjournaled session holds the GC blocker', async () => {
      vi.stubGlobal(
        'navigator',
        {
          locks: {
            request(
              _name: string,
              options: {
                mode: string;
                ifAvailable?: boolean;
              },
              callback:
                (lock: unknown | null) =>
                  unknown,
            ) {
              return Promise.resolve(
                callback(
                  options.ifAvailable
                    ? null
                    : {},
                ),
              );
            },
          },
        },
      );

      await expect(
        acquireRevisionStoreGcClearanceLease(
          'store-a',
        ),
      ).rejects.toBeInstanceOf(
        RevisionStoreGcBlockedError,
      );
    });
  },
);
