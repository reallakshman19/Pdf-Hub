import { describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './download';

describe('downloadBlob', () => {
  it('clicks a hidden anchor pointing at the object URL and revokes it after a delay', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const blob = new Blob(['content'], { type: 'text/plain' });
    downloadBlob(blob, 'file.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
