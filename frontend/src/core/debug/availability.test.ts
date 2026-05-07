import { describe, expect, it } from 'vitest';
import { isDebugRouteEnabled } from './availability';

describe('isDebugRouteEnabled', () => {
  it('allows localhost hosts in dev mode', () => {
    expect(isDebugRouteEnabled('localhost', true)).toBe(true);
    expect(isDebugRouteEnabled('127.0.0.1', true)).toBe(true);
    expect(isDebugRouteEnabled('::1', true)).toBe(true);
  });

  it('blocks non-local hosts and production mode', () => {
    expect(isDebugRouteEnabled('example.com', true)).toBe(false);
    expect(isDebugRouteEnabled('localhost', false)).toBe(false);
  });

  it('accepts bracketed ipv6 localhost', () => {
    expect(isDebugRouteEnabled('[::1]', true)).toBe(true);
  });

  it('rejects local hostnames when not in dev mode', () => {
    expect(isDebugRouteEnabled('127.0.0.1', false)).toBe(false);
    expect(isDebugRouteEnabled('::1', false)).toBe(false);
  });
});
