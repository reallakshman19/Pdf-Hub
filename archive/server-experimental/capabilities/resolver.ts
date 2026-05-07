import type { AppCapabilities } from './types';

export const resolveCapabilities = async (): Promise<AppCapabilities> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const start = performance.now();
    const response = await fetch('/api/ping', {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        mode: 'server',
        canOpenLocalFile: true,
        canMergeFiles: true,
        canSplitFile: true,
        canRunPreviewOcr: false,
        canRunServerOcr: true,
        canRunMacroApi: true,
        serverVersion: data.version || null,
        serverLatencyMs: Math.round(performance.now() - start),
      };
    }
  } catch {
    // Fallthrough to preview mode on any error (timeout, network down, etc)
  }

  return {
    mode: 'preview',
    canOpenLocalFile: true,
    canMergeFiles: true,
    canSplitFile: true,
    canRunPreviewOcr: true,
    canRunServerOcr: false,
    canRunMacroApi: false,
    serverVersion: null,
    serverLatencyMs: null,
  };
};
