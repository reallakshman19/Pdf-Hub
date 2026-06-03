const MOCK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Returns true when running on a local dev hostname.
 * Uses the same hostname-based guard as the debug route (§5 of AGENTS.md).
 * Never reads import.meta.env — compliant with INV-5.
 */
export function isMockEnabled(hostname: string): boolean {
  return MOCK_HOSTNAMES.has(hostname);
}
