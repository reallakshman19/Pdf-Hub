import { describe, expect, it } from 'vitest';
import { isDebugRouteEnabled } from './availability';

describe('isDebugRouteEnabled', () => {
  it('allows localhost hosts', () => {
    expect(isDebugRouteEnabled('localhost')).toBe(true);
    expect(isDebugRouteEnabled('127.0.0.1')).toBe(true);
    expect(isDebugRouteEnabled('::1')).toBe(true);
  });

  it('blocks non-local hosts', () => {
    expect(isDebugRouteEnabled('example.com')).toBe(false);
  });

  it('accepts bracketed ipv6 localhost', () => {
    expect(isDebugRouteEnabled('[::1]')).toBe(true);
  });
});
