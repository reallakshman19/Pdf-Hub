import { describe, it, expect } from 'vitest';
import { isMockEnabled } from './isMockEnabled';

describe('isMockEnabled', () => {
  it('returns true for localhost', () => {
    expect(isMockEnabled('localhost')).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    expect(isMockEnabled('127.0.0.1')).toBe(true);
  });

  it('returns true for ::1 (IPv6 loopback)', () => {
    expect(isMockEnabled('::1')).toBe(true);
  });

  it('returns true for [::1] (bracketed IPv6)', () => {
    expect(isMockEnabled('[::1]')).toBe(true);
  });

  it('returns false for production hostname', () => {
    expect(isMockEnabled('doccraft.app')).toBe(false);
  });

  it('returns false for staging hostname', () => {
    expect(isMockEnabled('staging.doccraft.app')).toBe(false);
  });

  it('returns false for github pages hostname', () => {
    expect(isMockEnabled('username.github.io')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isMockEnabled('')).toBe(false);
  });
});
