import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
}));

vi.mock('@/core/document/download', () => ({
  downloadBlob: mocks.downloadBlob,
}));

vi.mock('@/core/logger/service', () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { FileAdapter } from './FileAdapter';

describe('FileAdapter PDF export picker fallback', () => {
  const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
  const originalSavePicker = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');
  const savePicker = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: savePicker,
    });
  });

  afterEach(() => {
    if (originalSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalSecureContext);
    } else {
      Reflect.deleteProperty(window, 'isSecureContext');
    }
    if (originalSavePicker) {
      Object.defineProperty(window, 'showSaveFilePicker', originalSavePicker);
    } else {
      Reflect.deleteProperty(window, 'showSaveFilePicker');
    }
  });

  it('downloads the finished PDF when asynchronous export loses picker activation', async () => {
    savePicker.mockRejectedValueOnce(new DOMException(
      'Must be handling a user gesture to show a file picker.',
      'SecurityError',
    ));

    const result = await FileAdapter.savePdfBytes(
      new Uint8Array([1, 2, 3]), 'large-review.pdf', null,
    );

    expect(result).toBeNull();
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob), 'large-review.pdf',
    );
  });

  it('does not turn a cancelled save dialog into a download', async () => {
    savePicker.mockRejectedValueOnce(new DOMException(
      'The user aborted a request.', 'AbortError',
    ));

    await expect(FileAdapter.savePdfBytes(
      new Uint8Array([1, 2, 3]), 'cancelled.pdf', null,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });

  it('uses the selected handle when the picker is available', async () => {
    const write = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const handle = {
      createWritable: vi.fn(async () => ({ write, close })),
    } as unknown as FileSystemFileHandle;
    savePicker.mockResolvedValueOnce(handle);

    const result = await FileAdapter.savePdfBytes(
      new Uint8Array([1, 2, 3]), 'normal.pdf', null,
    );

    expect(result).toBe(handle);
    expect(write).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });
});
