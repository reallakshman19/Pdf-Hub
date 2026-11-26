import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasDisposalManager } from '../canvasDisposalManager';

describe('CanvasDisposalManager', () => {
  beforeEach(() => {
    CanvasDisposalManager.resetRegistry();
  });

  it('resets canvas dimensions to 0 to release GPU memory', () => {
    const clearRectMock = vi.fn();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    canvas.getContext = vi.fn().mockReturnValue({
      clearRect: clearRectMock,
    }) as unknown as typeof canvas.getContext;

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1600);

    CanvasDisposalManager.purge(canvas);

    expect(clearRectMock).toHaveBeenCalledWith(0, 0, 1200, 1600);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('handles null canvas safely without throwing', () => {
    expect(() => {
      CanvasDisposalManager.purge(null);
    }).not.toThrow();
  });

  it('estimates uncompressed VRAM occupancy in bytes', () => {
    // 800 x 1000 at 1x DPR = 800 * 1000 * 4 = 3,200,000 bytes (~3.2 MB)
    expect(CanvasDisposalManager.estimateVramBytes(800, 1000, 1)).toBe(3200000);

    // 800 x 1000 at 2x DPR = 1600 * 2000 * 4 = 12,800,000 bytes (~12.8 MB)
    expect(CanvasDisposalManager.estimateVramBytes(800, 1000, 2)).toBe(12800000);

    // 0 dimensions return 0 bytes
    expect(CanvasDisposalManager.estimateVramBytes(0, 1000)).toBe(0);
    expect(CanvasDisposalManager.estimateVramBytes(800, 0)).toBe(0);
  });

  it('tracks canvas registration, updates, and metrics correctly', () => {
    const canvas1 = document.createElement('canvas');
    canvas1.width = 1000;
    canvas1.height = 1000; // 4 MB

    const canvas2 = document.createElement('canvas');
    canvas2.width = 200;
    canvas2.height = 300; // 240 KB

    CanvasDisposalManager.registerCanvas('page:1', 'page', canvas1);
    CanvasDisposalManager.registerCanvas('thumb:1', 'thumbnail', canvas2);

    let metrics = CanvasDisposalManager.getMetrics();
    expect(metrics.totalCanvasesCount).toBe(2);
    expect(metrics.pageCanvasesCount).toBe(1);
    expect(metrics.pageVramBytes).toBe(4000000);
    expect(metrics.thumbnailCanvasesCount).toBe(1);
    expect(metrics.thumbnailVramBytes).toBe(240000);
    expect(metrics.totalVramBytes).toBe(4240000);

    // Update canvas1 dimensions
    canvas1.width = 500;
    canvas1.height = 500; // 1 MB
    CanvasDisposalManager.updateCanvas('page:1');

    metrics = CanvasDisposalManager.getMetrics();
    expect(metrics.pageVramBytes).toBe(1000000);
    expect(metrics.totalVramBytes).toBe(1240000);

    // Unregister canvas2
    CanvasDisposalManager.unregisterCanvas('thumb:1');
    metrics = CanvasDisposalManager.getMetrics();
    expect(metrics.totalCanvasesCount).toBe(1);
    expect(metrics.thumbnailCanvasesCount).toBe(0);
  });

  it('notifies listeners when canvases register, update, and unregister', () => {
    const listener = vi.fn();
    const unsubscribe = CanvasDisposalManager.addListener(listener);

    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 500;

    CanvasDisposalManager.registerCanvas('test:1', 'page', canvas);
    expect(listener).toHaveBeenCalledTimes(1);

    CanvasDisposalManager.updateCanvas('test:1');
    expect(listener).toHaveBeenCalledTimes(2);

    CanvasDisposalManager.unregisterCanvas('test:1');
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    CanvasDisposalManager.registerCanvas('test:2', 'page', canvas);
    expect(listener).toHaveBeenCalledTimes(3); // No further calls after unsubscribe
  });
});
