import { useEffect, useState } from 'react';
import { log } from '@/core/logger/service';

export type AppMode = 'preview' | 'server';

export interface Capabilities {
  mode: AppMode;
  serverAlive: boolean;
  hasServerOcr: boolean;
  hasPreviewOcr: boolean;
  hasMacroConsole: boolean;
  hasServerAnnotations: boolean;
  latencyMs: number | null;
}

const SERVER_HEALTH_PATH = '/api/health';
const SERVER_PROBE_TIMEOUT_MS = 800;

const PREVIEW_CAPABILITIES: Capabilities = {
  mode: 'preview',
  serverAlive: false,
  hasServerOcr: false,
  hasPreviewOcr: true,
  hasMacroConsole: false,
  hasServerAnnotations: false,
  latencyMs: null,
};

const SERVER_CAPABILITIES = (latencyMs: number): Capabilities => ({
  mode: 'server',
  serverAlive: true,
  hasServerOcr: true,
  hasPreviewOcr: true,
  hasMacroConsole: true,
  hasServerAnnotations: true,
  latencyMs,
});

let cachedCapabilities: Capabilities = PREVIEW_CAPABILITIES;
let detectionPromise: Promise<Capabilities> | null = null;
let lastLoggedSignature = '';

const capabilitySignature = (capabilities: Capabilities): string =>
  `${capabilities.mode}:${capabilities.serverAlive}:${capabilities.latencyMs ?? 'none'}`;

const logCapabilities = (capabilities: Capabilities): void => {
  const signature = capabilitySignature(capabilities);
  if (signature === lastLoggedSignature) return;
  lastLoggedSignature = signature;
  log('capabilities', 'Mode detection complete', {
    mode: capabilities.mode,
    serverAlive: capabilities.serverAlive,
    latencyMs: capabilities.latencyMs,
  });
};

export async function detectCapabilities(): Promise<Capabilities> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const timer = window.setTimeout(() => controller.abort(), SERVER_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(SERVER_HEALTH_PATH, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return PREVIEW_CAPABILITIES;
    }

    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return SERVER_CAPABILITIES(latencyMs);
  } catch {
    return PREVIEW_CAPABILITIES;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Runtime feature contract for the shell. Defaults to preview mode so unavailable
 * server features are hidden until the local server proves it is alive.
 */
export function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] = useState<Capabilities>(cachedCapabilities);

  useEffect(() => {
    let cancelled = false;

    if (!detectionPromise) {
      detectionPromise = detectCapabilities().then((detected) => {
        cachedCapabilities = detected;
        logCapabilities(detected);
        return detected;
      });
    }

    detectionPromise.then((detected) => {
      if (!cancelled) {
        setCapabilities(detected);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return capabilities;
}
