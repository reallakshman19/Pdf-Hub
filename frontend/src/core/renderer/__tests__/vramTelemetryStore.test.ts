import { describe, it, expect, beforeEach } from 'vitest';
import {
  useVramTelemetryStore,
  formatBytes,
  VRAM_OPTIMAL_THRESHOLD_BYTES,
  VRAM_CRITICAL_THRESHOLD_BYTES,
} from '../vramTelemetryStore';
import { CanvasDisposalManager } from '../canvasDisposalManager';

describe('vramTelemetryStore', () => {
  beforeEach(() => {
    CanvasDisposalManager.resetRegistry();
    useVramTelemetryStore.getState().refreshTelemetry();
  });

  it('formats byte quantities into readable strings', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
    expect(formatBytes(100.5 * 1024 * 1024)).toBe('100.5 MB');
  });

  it('computes health status thresholds correctly', () => {
    // Under 80MB = optimal
    useVramTelemetryStore.getState().setFromSnapshot({
      pageCanvasesCount: 1,
      pageVramBytes: 50 * 1024 * 1024,
      thumbnailCanvasesCount: 0,
      thumbnailVramBytes: 0,
      otherCanvasesCount: 0,
      otherVramBytes: 0,
      totalCanvasesCount: 1,
      totalVramBytes: 50 * 1024 * 1024,
    });
    expect(useVramTelemetryStore.getState().status).toBe('optimal');

    // 80MB to 200MB = moderate
    useVramTelemetryStore.getState().setFromSnapshot({
      pageCanvasesCount: 2,
      pageVramBytes: VRAM_OPTIMAL_THRESHOLD_BYTES + 1024,
      thumbnailCanvasesCount: 0,
      thumbnailVramBytes: 0,
      otherCanvasesCount: 0,
      otherVramBytes: 0,
      totalCanvasesCount: 2,
      totalVramBytes: VRAM_OPTIMAL_THRESHOLD_BYTES + 1024,
    });
    expect(useVramTelemetryStore.getState().status).toBe('moderate');

    // Over 200MB = critical
    useVramTelemetryStore.getState().setFromSnapshot({
      pageCanvasesCount: 5,
      pageVramBytes: VRAM_CRITICAL_THRESHOLD_BYTES + 1024,
      thumbnailCanvasesCount: 0,
      thumbnailVramBytes: 0,
      otherCanvasesCount: 0,
      otherVramBytes: 0,
      totalCanvasesCount: 5,
      totalVramBytes: VRAM_CRITICAL_THRESHOLD_BYTES + 1024,
    });
    expect(useVramTelemetryStore.getState().status).toBe('critical');
  });

  it('purges inactive caches and records purge timestamp', () => {
    const beforePurge = Date.now();
    useVramTelemetryStore.getState().purgeInactiveCaches();
    const state = useVramTelemetryStore.getState();
    expect(state.lastPurgeTimestamp).toBeGreaterThanOrEqual(beforePurge);
  });
});
