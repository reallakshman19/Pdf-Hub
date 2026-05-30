import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoggerStore } from '@/core/logger/store';

const loadCapabilitiesModule = async () => {
  vi.resetModules();
  return import('./useCapabilities');
};

describe('detectCapabilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLoggerStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    useLoggerStore.getState().clear();
  });

  it('returns preview capabilities with measured latency when the health probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const { detectCapabilities } = await loadCapabilitiesModule();

    const detected = await detectCapabilities();

    expect(detected.mode).toBe('preview');
    expect(detected.serverAlive).toBe(false);
    expect(detected.hasServerOcr).toBe(false);
    expect(detected.hasMacroConsole).toBe(false);
    expect(detected.latencyMs).toEqual(expect.any(Number));
  });

  it('uses VITE_API_BASE_URL for the health probe without double slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8000/');
    const { detectCapabilities } = await loadCapabilitiesModule();

    const detected = await detectCapabilities();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/health',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(detected.mode).toBe('server');
    expect(detected.hasServerOcr).toBe(true);
  });
});
