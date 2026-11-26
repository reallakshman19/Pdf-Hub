/**
 * CanvasDisposalManager enforces immediate browser GPU VRAM deallocation
 * when pages leave the active virtualized viewport and tracks active canvas memory.
 *
 * In Chromium and WebKit, setting `canvas.width = 0` and `canvas.height = 0`
 * forces the underlying rendering engine to discard the native pixel buffer
 * and texture backing store without waiting for indeterminate V8 GC cycles.
 */

export type CanvasCategory = 'page' | 'thumbnail' | 'overlay' | 'cad';

export interface RegisteredCanvasInfo {
  id: string;
  category: CanvasCategory;
  width: number;
  height: number;
  bytes: number;
  canvas: HTMLCanvasElement;
}

export interface VramMetricsSnapshot {
  pageCanvasesCount: number;
  pageVramBytes: number;
  thumbnailCanvasesCount: number;
  thumbnailVramBytes: number;
  otherCanvasesCount: number;
  otherVramBytes: number;
  totalCanvasesCount: number;
  totalVramBytes: number;
}

export type VramChangeListener = (snapshot: VramMetricsSnapshot) => void;

export class CanvasDisposalManager {
  private static readonly canvasRegistry = new Map<string, RegisteredCanvasInfo>();
  private static readonly listeners = new Set<VramChangeListener>();

  /**
   * Resets and purges canvas memory, releasing GPU backing buffers.
   */
  static purge(canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch {
      // Best-effort context clearing
    }
    // Forcing zero dimensions tells browser graphics pipeline to free VRAM immediately
    canvas.width = 0;
    canvas.height = 0;
  }

  /**
   * Estimates uncompressed GPU memory occupancy in bytes for a given viewport size.
   * RGBA bitmap = width * height * 4 bytes.
   */
  static estimateVramBytes(
    width: number,
    height: number,
    devicePixelRatio = 1,
  ): number {
    if (width <= 0 || height <= 0) return 0;
    const pixelWidth = Math.round(width * Math.max(1, devicePixelRatio));
    const pixelHeight = Math.round(height * Math.max(1, devicePixelRatio));
    return pixelWidth * pixelHeight * 4;
  }

  /**
   * Registers an active canvas in the telemetry registry.
   */
  static registerCanvas(
    id: string,
    category: CanvasCategory,
    canvas: HTMLCanvasElement,
  ): void {
    const bytes = this.estimateVramBytes(canvas.width, canvas.height, 1);
    this.canvasRegistry.set(id, {
      id,
      category,
      width: canvas.width,
      height: canvas.height,
      bytes,
      canvas,
    });
    this.notifyListeners();
  }

  /**
   * Updates registered canvas dimensions and recomputes occupied VRAM bytes.
   */
  static updateCanvas(id: string): void {
    const entry = this.canvasRegistry.get(id);
    if (!entry) return;
    entry.width = entry.canvas.width;
    entry.height = entry.canvas.height;
    entry.bytes = this.estimateVramBytes(entry.canvas.width, entry.canvas.height, 1);
    this.notifyListeners();
  }

  /**
   * Unregisters a canvas and purges its backing store.
   */
  static unregisterCanvas(id: string, shouldPurge = true): void {
    const entry = this.canvasRegistry.get(id);
    if (!entry) return;
    this.canvasRegistry.delete(id);
    if (shouldPurge) {
      this.purge(entry.canvas);
    }
    this.notifyListeners();
  }

  /**
   * Returns current aggregate metrics across all registered canvases.
   */
  static getMetrics(): VramMetricsSnapshot {
    let pageCount = 0;
    let pageBytes = 0;
    let thumbCount = 0;
    let thumbBytes = 0;
    let otherCount = 0;
    let otherBytes = 0;

    for (const info of this.canvasRegistry.values()) {
      if (info.category === 'page') {
        pageCount += 1;
        pageBytes += info.bytes;
      } else if (info.category === 'thumbnail') {
        thumbCount += 1;
        thumbBytes += info.bytes;
      } else {
        otherCount += 1;
        otherBytes += info.bytes;
      }
    }

    return {
      pageCanvasesCount: pageCount,
      pageVramBytes: pageBytes,
      thumbnailCanvasesCount: thumbCount,
      thumbnailVramBytes: thumbBytes,
      otherCanvasesCount: otherCount,
      otherVramBytes: otherBytes,
      totalCanvasesCount: this.canvasRegistry.size,
      totalVramBytes: pageBytes + thumbBytes + otherBytes,
    };
  }

  /**
   * Subscribes a listener to canvas registry updates.
   */
  static addListener(listener: VramChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clears the entire registry and purges all canvases.
   */
  static resetRegistry(): void {
    for (const entry of this.canvasRegistry.values()) {
      this.purge(entry.canvas);
    }
    this.canvasRegistry.clear();
    this.notifyListeners();
  }

  private static notifyListeners(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getMetrics();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Listener safety
      }
    }
  }
}
