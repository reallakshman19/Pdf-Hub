import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCapabilities } from './resolver';

describe('resolveCapabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns server mode when /api/ping succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok', version: '0.1.0' }),
    });

    const caps = await resolveCapabilities();
    expect(caps.mode).toBe('server');
    expect(caps.canRunServerOcr).toBe(true);
    expect(caps.serverVersion).toBe('0.1.0');
    expect(typeof caps.serverLatencyMs).toBe('number');
  });

  it('returns preview mode when /api/ping fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const caps = await resolveCapabilities();
    expect(caps.mode).toBe('preview');
    expect(caps.canRunServerOcr).toBe(false);
    expect(caps.canRunPreviewOcr).toBe(true);
    expect(caps.serverVersion).toBeNull();
  });
  
  it('returns preview mode when /api/ping times out (abort)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const caps = await resolveCapabilities();
    expect(caps.mode).toBe('preview');
  });
});
