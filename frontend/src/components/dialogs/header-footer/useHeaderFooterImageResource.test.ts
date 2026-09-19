import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHeaderFooterImageResource } from './useHeaderFooterImageResource';

const admissionMocks = vi.hoisted(() => ({
  admitHeaderFooterImageFile: vi.fn(),
}));

vi.mock('@/core/header-footer/imageAdmission', () => ({
  admitHeaderFooterImageFile:
    admissionMocks.admitHeaderFooterImageFile,
}));

describe('useHeaderFooterImageResource', () => {
  const createObjectUrl = vi.fn();
  const revokeObjectUrl = vi.fn();
  let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });

    createObjectUrl
      .mockReturnValueOnce('blob:logo-1')
      .mockReturnValueOnce('blob:logo-2');
  });

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it('revokes the previous preview when an admitted image is replaced', async () => {
    admissionMocks.admitHeaderFooterImageFile
      .mockResolvedValueOnce({
        resourceId: 'header-footer-image:1',
        fileName: 'one.png',
        mimeType: 'image/png',
        width: 10,
        height: 10,
        bytes: new Uint8Array([1]),
      })
      .mockResolvedValueOnce({
        resourceId: 'header-footer-image:2',
        fileName: 'two.png',
        mimeType: 'image/png',
        width: 20,
        height: 10,
        bytes: new Uint8Array([2]),
      });

    const { result } = renderHook(() =>
      useHeaderFooterImageResource(true),
    );

    await act(async () => {
      await result.current.admit(
        new File([], 'one.png', { type: 'image/png' }),
      );
    });
    expect(result.current.previewUrl).toBe('blob:logo-1');

    await act(async () => {
      await result.current.admit(
        new File([], 'two.png', { type: 'image/png' }),
      );
    });

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:logo-1');
    expect(result.current.previewUrl).toBe('blob:logo-2');
  });

  it('revokes the active preview when cleared or closed', async () => {
    admissionMocks.admitHeaderFooterImageFile.mockResolvedValue({
      resourceId: 'header-footer-image:1',
      fileName: 'logo.png',
      mimeType: 'image/png',
      width: 10,
      height: 10,
      bytes: new Uint8Array([1]),
    });

    const { result, rerender } = renderHook(
      ({ isOpen }) => useHeaderFooterImageResource(isOpen),
      { initialProps: { isOpen: true } },
    );

    await act(async () => {
      await result.current.admit(
        new File([], 'logo.png', { type: 'image/png' }),
      );
    });

    act(() => {
      result.current.clear();
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:logo-1');
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.admitted).toBeNull();

    createObjectUrl.mockReturnValueOnce('blob:logo-3');
    await act(async () => {
      await result.current.admit(
        new File([], 'logo.png', { type: 'image/png' }),
      );
    });

    rerender({ isOpen: false });

    await waitFor(() => {
      expect(result.current.previewUrl).toBeNull();
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:logo-3');
  });
});
