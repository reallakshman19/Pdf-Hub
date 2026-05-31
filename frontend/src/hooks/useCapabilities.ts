import { useEffect, useState } from 'react';
import { log } from '@/core/logger/service';

// ── S-Phase 1: Three-mode system ────────────────────────────────
export type AppMode = 'static' | 'preview' | 'server';

export interface Capabilities {
  mode: AppMode;
  serverAlive: boolean;
  // Client capabilities (always true for preview+server, always true for static)
  canUseClientPdfTools: boolean;
  canUseClientAnnotations: boolean;
  canUseClientWriter: boolean;
  canUseClientMacros: boolean;
  // Server capabilities (true only in server mode)
  canUseServerOcr: boolean;
  canUseServerAnnotations: boolean;
  canUseMacroApi: boolean;
  canProbeServer: boolean;
  // Legacy compat aliases
  hasServerOcr: boolean;
  hasPreviewOcr: boolean;
  hasMacroConsole: boolean;
  hasServerAnnotations: boolean;
  latencyMs: number | null;
}

const SERVER_HEALTH_PATH = '/api/health';
const SERVER_PROBE_TIMEOUT_MS = 800;

const getServerHealthUrl = (): string => {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!apiBase) return SERVER_HEALTH_PATH;
  return `${apiBase.replace(/\/$/, '')}${SERVER_HEALTH_PATH}`;
};

/**
 * Determine initial mode from build-time env.
 * INV-5 EXCEPTION: This is the ONLY place import.meta.env gates mode.
 */
function getInitialMode(): AppMode {
  const envMode = import.meta.env.VITE_APP_MODE as string | undefined;
  if (envMode === 'static') return 'static';
  if (envMode === 'server') return 'server';
  return 'preview'; // default: probe server once
}

function buildCapabilities(
  mode: AppMode,
  serverAlive: boolean,
  latencyMs: number | null,
): Capabilities {
  const isServer = mode === 'server' && serverAlive;
  return {
    mode,
    serverAlive,
    canUseClientPdfTools: true,
    canUseClientAnnotations: true,
    canUseClientWriter: true,
    canUseClientMacros: true,
    canUseServerOcr: isServer,
    canUseServerAnnotations: isServer,
    canUseMacroApi: isServer,
    canProbeServer: mode !== 'static',
    // Legacy compat
    hasServerOcr: isServer,
    hasPreviewOcr: true,
    hasMacroConsole: isServer,
    hasServerAnnotations: isServer,
    latencyMs,
  };
}

function getInitialCapabilities(): Capabilities {
  const initialMode = getInitialMode();
  if (initialMode === 'static') {
    return buildCapabilities('static', false, null);
  }
  return buildCapabilities('preview', false, null);
}

const STATIC_CAPABILITIES = buildCapabilities('static', false, null);

let cachedCapabilities: Capabilities = getInitialCapabilities();
let detectionPromise: Promise<Capabilities> | null = null;
let lastLoggedSignature = '';

const capabilitySignature = (c: Capabilities): string =>
  `${c.mode}:${c.serverAlive}:${c.latencyMs ?? 'none'}`;

const logCapabilities = (c: Capabilities): void => {
  const sig = capabilitySignature(c);
  if (sig === lastLoggedSignature) return;
  lastLoggedSignature = sig;
  log('capabilities', 'Mode detection complete', {
    mode: c.mode,
    serverAlive: c.serverAlive,
    latencyMs: c.latencyMs,
  });
};

export async function detectCapabilities(): Promise<Capabilities> {
  const initialMode = getInitialMode();
  // Static mode: no network call ever
  if (initialMode === 'static') {
    return STATIC_CAPABILITIES;
  }

  const controller = new AbortController();
  const startedAt = performance.now();
  const timer = window.setTimeout(
    () => controller.abort(),
    SERVER_PROBE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(getServerHealthUrl(), {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (!response.ok) {
      return buildCapabilities('preview', false, latencyMs);
    }
    return buildCapabilities('server', true, latencyMs);
  } catch {
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return buildCapabilities('preview', false, latencyMs);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Runtime feature contract for the shell.
 */
export function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] =
    useState<Capabilities>(cachedCapabilities);

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

/** Test helper: create capabilities for a specific mode */
export function createTestCapabilities(
  mode: AppMode,
  overrides?: Partial<Capabilities>,
): Capabilities {
  return {
    ...buildCapabilities(mode, mode === 'server', mode === 'server' ? 5 : null),
    ...overrides,
  };
}
