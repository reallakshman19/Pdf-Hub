import { describe, expect, it } from 'vitest';
import { reconcileArchivePaths } from './archivePath';

const sensitivePolicy = {
  caseMode: 'sensitive',
  unicodeMode: 'preserve',
} as const;

describe('archive path reconciliation', () => {
  it('rejects traversal and absolute paths', () => {
    const result = reconcileArchivePaths([
      { rawPath: '../manifest.json', inputIndex: 0 },
      { rawPath: '/original.pdf', inputIndex: 1 },
      { rawPath: 'C:\\temp\\asset.png', inputIndex: 2 },
    ], sensitivePolicy);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'ARCHIVE_PATH_TRAVERSAL',
      'ARCHIVE_PATH_ABSOLUTE',
      'ARCHIVE_PATH_EMPTY_SEGMENT',
      'ARCHIVE_PATH_DRIVE_QUALIFIED',
    ]);
    expect(result.entries).toEqual([]);
  });

  it('detects slash-normalized path collisions', () => {
    const result = reconcileArchivePaths([
      { rawPath: 'assets/logo.png', inputIndex: 0 },
      { rawPath: 'assets\\logo.png', inputIndex: 1 },
    ], sensitivePolicy);

    expect(result.entries).toHaveLength(2);
    expect(result.diagnostics).toMatchObject([
      {
        code: 'ARCHIVE_PATH_COLLISION',
        inputIndex: 1,
        path: 'assets/logo.png',
      },
    ]);
  });

  it('distinguishes duplicate paths from file-directory collisions', () => {
    const result = reconcileArchivePaths([
      { rawPath: 'assets/logo.png', inputIndex: 0 },
      { rawPath: 'assets/logo.png', inputIndex: 1 },
      { rawPath: 'assets/logo.png/', inputIndex: 2, directory: true },
    ], sensitivePolicy);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'ARCHIVE_PATH_DUPLICATE',
      'ARCHIVE_FILE_DIRECTORY_COLLISION',
    ]);
  });

  it('supports an explicit ASCII case-insensitive comparison mode', () => {
    const result = reconcileArchivePaths([
      { rawPath: 'Manifest.json', inputIndex: 0 },
      { rawPath: 'manifest.json', inputIndex: 1 },
    ], {
      caseMode: 'ascii-insensitive',
      unicodeMode: 'preserve',
    });

    expect(result.diagnostics[0]?.code).toBe('ARCHIVE_PATH_COLLISION');
  });

  it('orders diagnostics independently of input completion order', () => {
    const result = reconcileArchivePaths([
      { rawPath: 'z/../file', inputIndex: 2 },
      { rawPath: '/absolute', inputIndex: 0 },
      { rawPath: 'a//file', inputIndex: 1 },
    ], sensitivePolicy);

    expect(result.diagnostics.map((item) => item.inputIndex)).toEqual([0, 0, 1, 2]);
  });
});
