import { describe, it, expect, beforeEach } from 'vitest';
import { useLoggerStore } from './store';
import { log } from './service';

describe('Logger Store', () => {
  beforeEach(() => {
    useLoggerStore.getState().clear();
  });

  it('adds entries and truncates at 500', () => {
    for (let i = 0; i < 510; i++) {
      log('system', `Message ${i}`);
    }

    const { entries } = useLoggerStore.getState();
    expect(entries.length).toBe(500);
    expect(entries[0].message).toBe('Message 509');
    expect(entries[499].message).toBe('Message 10');
  });
});
