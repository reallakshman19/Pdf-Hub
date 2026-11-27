import { create } from 'zustand';
import {
  CanvasDisposalManager,
  type VramMetricsSnapshot,
} from './canvasDisposalManager';
import { thumbnailRenderCache } from './renderResourceCache';

export type VramHealthStatus = 'optimal' | 'moderate' | 'critical';

export interface VramTelemetryState extends VramMetricsSnapshot {
  formattedVram: string;
  peakVramBytes: number;
  jsHeapUsedBytes?: number;
  jsHeapLimitBytes?: number;
  formattedJsHeap?: string;
  status: VramHealthStatus;
  lastPurgeTimestamp?: number;
}

export interface VramTelemetryActions {
  refreshTelemetry: () => void;
  purgeInactiveCaches: () => void;
  setFromSnapshot: (snapshot: VramMetricsSnapshot) => void;
}

export type VramTelemetryStore = VramTelemetryState & VramTelemetryActions;

export const VRAM_OPTIMAL_THRESHOLD_BYTES = 80 * 1024 * 1024; // 80 MB
export const VRAM_CRITICAL_THRESHOLD_BYTES = 200 * 1024 * 1024; // 200 MB

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function computeHealthStatus(bytes: number): VramHealthStatus {
  if (bytes >= VRAM_CRITICAL_THRESHOLD_BYTES) return 'critical';
  if (bytes >= VRAM_OPTIMAL_THRESHOLD_BYTES) return 'moderate';
  return 'optimal';
}

function getJsHeapInfo(): { used?: number; limit?: number; formatted?: string } {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const memory = (window.performance as unknown as {
      memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
    }).memory;
    if (memory?.usedJSHeapSize) {
      return {
        used: memory.usedJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        formatted: formatBytes(memory.usedJSHeapSize),
      };
    }
  }
  return {};
}

const initialMetrics = CanvasDisposalManager.getMetrics();
const initialHeap = getJsHeapInfo();

export const useVramTelemetryStore = create<VramTelemetryStore>((set, get) => ({
  ...initialMetrics,
  formattedVram: formatBytes(initialMetrics.totalVramBytes),
  peakVramBytes: initialMetrics.totalVramBytes,
  jsHeapUsedBytes: initialHeap.used,
  jsHeapLimitBytes: initialHeap.limit,
  formattedJsHeap: initialHeap.formatted,
  status: computeHealthStatus(initialMetrics.totalVramBytes),
  lastPurgeTimestamp: undefined,

  refreshTelemetry: () => {
    const metrics = CanvasDisposalManager.getMetrics();
    const heap = getJsHeapInfo();
    const state = get();
    const peak = Math.max(state.peakVramBytes, metrics.totalVramBytes);
    set({
      ...metrics,
      formattedVram: formatBytes(metrics.totalVramBytes),
      peakVramBytes: peak,
      jsHeapUsedBytes: heap.used,
      jsHeapLimitBytes: heap.limit,
      formattedJsHeap: heap.formatted,
      status: computeHealthStatus(metrics.totalVramBytes),
    });
  },

  setFromSnapshot: (metrics: VramMetricsSnapshot) => {
    const state = get();
    const peak = Math.max(state.peakVramBytes, metrics.totalVramBytes);
    const heap = getJsHeapInfo();
    set({
      ...metrics,
      formattedVram: formatBytes(metrics.totalVramBytes),
      peakVramBytes: peak,
      jsHeapUsedBytes: heap.used,
      jsHeapLimitBytes: heap.limit,
      formattedJsHeap: heap.formatted,
      status: computeHealthStatus(metrics.totalVramBytes),
    });
  },

  purgeInactiveCaches: () => {
    // Purge unreferenced thumbnail cache items
    thumbnailRenderCache.deleteWhere(() => true, { force: false });

    const metrics = CanvasDisposalManager.getMetrics();
    const heap = getJsHeapInfo();
    set({
      ...metrics,
      formattedVram: formatBytes(metrics.totalVramBytes),
      jsHeapUsedBytes: heap.used,
      jsHeapLimitBytes: heap.limit,
      formattedJsHeap: heap.formatted,
      status: computeHealthStatus(metrics.totalVramBytes),
      lastPurgeTimestamp: Date.now(),
    });
  },
}));

// Wire CanvasDisposalManager listener to auto-update vramTelemetryStore
CanvasDisposalManager.addListener((metrics) => {
  useVramTelemetryStore.getState().setFromSnapshot(metrics);
});

export const useVramMetrics = () =>
  useVramTelemetryStore((s) => ({
    totalCanvasesCount: s.totalCanvasesCount,
    totalVramBytes: s.totalVramBytes,
    formattedVram: s.formattedVram,
    status: s.status,
    pageCanvasesCount: s.pageCanvasesCount,
    pageVramBytes: s.pageVramBytes,
    thumbnailCanvasesCount: s.thumbnailCanvasesCount,
    thumbnailVramBytes: s.thumbnailVramBytes,
    formattedJsHeap: s.formattedJsHeap,
  }));
