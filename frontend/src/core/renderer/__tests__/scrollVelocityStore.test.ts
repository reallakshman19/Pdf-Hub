import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useScrollVelocityStore,
  VELOCITY_RAPID_THRESHOLD,
  VELOCITY_SETTLE_MS,
} from '../scrollVelocityStore';

describe('scrollVelocityStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useScrollVelocityStore.getState().reset();
  });

  it('initializes with default zero velocity and false isRapidScrolling', () => {
    const state = useScrollVelocityStore.getState();
    expect(state.velocity).toBe(0);
    expect(state.isRapidScrolling).toBe(false);
  });

  it('records slow scrolling without triggering isRapidScrolling', () => {
    // 100px over 500ms = 200 px/sec (below threshold of 1000)
    useScrollVelocityStore.getState().recordScroll(0, 1000);
    useScrollVelocityStore.getState().recordScroll(100, 1500);

    const state = useScrollVelocityStore.getState();
    expect(state.velocity).toBe(200);
    expect(state.isRapidScrolling).toBe(false);
  });

  it('triggers isRapidScrolling when velocity exceeds threshold', () => {
    // 500px in 100ms = 5000 px/sec (well above 1000 threshold)
    useScrollVelocityStore.getState().recordScroll(0, 1000);
    useScrollVelocityStore.getState().recordScroll(500, 1100);

    const state = useScrollVelocityStore.getState();
    expect(state.velocity).toBe(5000);
    expect(state.isRapidScrolling).toBe(true);
  });

  it('settles back to 0 velocity and false isRapidScrolling after settle timeout', () => {
    useScrollVelocityStore.getState().recordScroll(0, 1000);
    useScrollVelocityStore.getState().recordScroll(1000, 1100);

    expect(useScrollVelocityStore.getState().isRapidScrolling).toBe(true);

    // Fast-forward past VELOCITY_SETTLE_MS
    vi.advanceTimersByTime(VELOCITY_SETTLE_MS + 20);

    const settledState = useScrollVelocityStore.getState();
    expect(settledState.velocity).toBe(0);
    expect(settledState.isRapidScrolling).toBe(false);
    expect(settledState.lastOffset).toBeNull();
  });

  it('resets immediately on manual reset()', () => {
    useScrollVelocityStore.getState().recordScroll(0, 1000);
    useScrollVelocityStore.getState().recordScroll(800, 1100);
    expect(useScrollVelocityStore.getState().velocity).toBeGreaterThan(VELOCITY_RAPID_THRESHOLD);

    useScrollVelocityStore.getState().reset();
    const state = useScrollVelocityStore.getState();
    expect(state.velocity).toBe(0);
    expect(state.isRapidScrolling).toBe(false);
  });
});
