import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileAdapter } from './FileAdapter';
import * as downloadModule from '@/core/document/download';

describe('FileAdapter pick/save/hash workflows', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('hashes bytes with SHA-256 prefix', async () => {
    const hash = await FileAdapter.hashBytes(new Uint8Array([1, 2, 3, 4]));
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('downloads bytes via downloadBlob and handles savePdfBytes handle & fallback paths', async () => {
    const dlSpy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    FileAdapter.downloadBytes(bytes, 'sample.pdf');
    expect(dlSpy).toHaveBeenCalledTimes(1);

    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const fakeHandle = {
      createWritable: vi.fn(async () => ({ write, close })),
    } as unknown as FileSystemFileHandle;

    const returned = await FileAdapter.savePdfBytes(bytes, 'sample.pdf', fakeHandle);
    expect(returned).toBe(fakeHandle);
    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);

    // Fallback to download when no handle and no showSaveFilePicker
    const fallback = await FileAdapter.savePdfBytes(bytes, 'fallback.pdf', null);
    expect(fallback).toBeNull();
    expect(dlSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to download on SecurityError from showSaveFilePicker and rethrows AbortError', async () => {
    const dlSpy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {});
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('Transient activation expired', 'SecurityError');
    });
    const res = await FileAdapter.savePdfBytes(new Uint8Array([1, 2, 3]), 'sec.pdf', null);
    expect(res).toBeNull();
    expect(dlSpy).toHaveBeenCalledTimes(1);

    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('Cancelled', 'AbortError');
    });
    await expect(FileAdapter.savePdfBytes(new Uint8Array([1, 2, 3]), 'abort.pdf', null)).rejects.toThrow();
  });

  it('picks files via showOpenFilePicker with permission retry and rejects invalid extension', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'ok.pdf', { type: 'application/pdf' });
    let firstAttempt = true;
    const fakeHandle = {
      getFile: vi.fn(async () => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new DOMException('Denied', 'NotAllowedError');
        }
        return pdfFile;
      }),
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
    } as unknown as FileSystemFileHandle;

    window.showOpenFilePicker = vi.fn(async () => [fakeHandle]);
    const picked = await FileAdapter.pickPdfFiles(false);
    expect(picked).toHaveLength(1);
    expect(picked[0].name).toBe('ok.pdf');
    expect(Array.from(picked[0].bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);

    const badFile = new File([new Uint8Array([1, 2])], 'notes.txt', { type: 'text/plain' });
    window.showOpenFilePicker = vi.fn(async () => [{ getFile: async () => badFile } as FileSystemFileHandle]);
    await expect(FileAdapter.pickPdfFiles(false)).rejects.toThrow('Invalid file type');
  });
});
