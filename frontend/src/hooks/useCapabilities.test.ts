import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLoggerStore } from '@/core/logger/store';

const loadCapabilitiesModule = async () => {
  vi.resetModules();
  return import('./useCapabilities');
};

describe('useCapabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_APP_MODE', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.useFakeTimers();
    useLoggerStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    useLoggerStore.getState().clear();
  });

  describe('static mode', () => {
    it('returns static capabilities without any fetch call', async () => {
      vi.stubEnv('VITE_APP_MODE', 'static');
      const { detectCapabilities } = await loadCapabilitiesModule();
      
      const caps = await detectCapabilities();
      
      expect(caps.mode).toBe('static');
      expect(caps.serverAlive).toBe(false);
      expect(caps.canUseClientPdfTools).toBe(true);
      expect(caps.canUseClientAnnotations).toBe(true);
      expect(caps.canUseClientWriter).toBe(true);
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canUseServerOcr).toBe(false);
      expect(caps.canUseMacroApi).toBe(false);
      expect(caps.canProbeServer).toBe(false);
      expect(caps.latencyMs).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('preview mode (server unreachable)', () => {
    it('falls back to preview when fetch fails', async () => {
      vi.stubEnv('VITE_APP_MODE', '');
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error'),
      );
      const { detectCapabilities } = await loadCapabilitiesModule();
      
      const caps = await detectCapabilities();
      
      expect(caps.mode).toBe('preview');
      expect(caps.serverAlive).toBe(false);
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canProbeServer).toBe(true);
      expect(caps.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('server mode (server reachable)', () => {
    it('detects server when health check succeeds', async () => {
      vi.stubEnv('VITE_APP_MODE', '');
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );
      const { detectCapabilities } = await loadCapabilitiesModule();
      
      const caps = await detectCapabilities();
      
      expect(caps.mode).toBe('server');
      expect(caps.serverAlive).toBe(true);
      expect(caps.canUseServerOcr).toBe(true);
      expect(caps.canUseMacroApi).toBe(true);
      expect(caps.hasServerAnnotations).toBe(true);
    });
  });

  describe('createTestCapabilities helper', () => {
    it('creates static test capabilities', async () => {
      const { createTestCapabilities } = await loadCapabilitiesModule();
      const caps = createTestCapabilities('static');
      
      expect(caps.mode).toBe('static');
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canUseServerOcr).toBe(false);
    });

    it('creates server test capabilities', async () => {
      const { createTestCapabilities } = await loadCapabilitiesModule();
      const caps = createTestCapabilities('server');
      
      expect(caps.mode).toBe('server');
      expect(caps.canUseServerOcr).toBe(true);
    });

    it('accepts overrides', async () => {
      const { createTestCapabilities } = await loadCapabilitiesModule();
      const caps = createTestCapabilities('static', { canUseClientWriter: false });
      
      expect(caps.canUseClientWriter).toBe(false);
    });
  });
});
