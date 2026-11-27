import { create } from 'zustand';

export interface ScrollVelocityState {
  velocity: number; // in pixels per second
  isRapidScrolling: boolean;
  lastOffset: number | null;
  lastTimestamp: number | null;
  settleTimeoutId: ReturnType<typeof setTimeout> | null;
}

export interface ScrollVelocityActions {
  recordScroll: (offset: number, customTimestamp?: number) => void;
  reset: () => void;
}

export type ScrollVelocityStore = ScrollVelocityState & ScrollVelocityActions;

export const VELOCITY_RAPID_THRESHOLD = 1000; // px/sec
export const VELOCITY_SETTLE_MS = 180; // ms to declare scroll settled

export const useScrollVelocityStore = create<ScrollVelocityStore>((set, get) => ({
  velocity: 0,
  isRapidScrolling: false,
  lastOffset: null,
  lastTimestamp: null,
  settleTimeoutId: null,

  recordScroll: (offset: number, customTimestamp?: number) => {
    const now = customTimestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const state = get();

    // Clear any pending settle timer
    if (state.settleTimeoutId !== null) {
      clearTimeout(state.settleTimeoutId);
    }

    let calculatedVelocity = 0;
    if (state.lastOffset !== null && state.lastTimestamp !== null) {
      const dt = now - state.lastTimestamp;
      const dOffset = Math.abs(offset - state.lastOffset);
      if (dt > 0 && dt <= 1000) {
        calculatedVelocity = (dOffset / dt) * 1000;
      }
    }

    const isRapid = calculatedVelocity >= VELOCITY_RAPID_THRESHOLD || (state.isRapidScrolling && calculatedVelocity >= VELOCITY_RAPID_THRESHOLD * 0.5);

    const settleTimer = setTimeout(() => {
      set({
        velocity: 0,
        isRapidScrolling: false,
        settleTimeoutId: null,
        lastOffset: null,
        lastTimestamp: null,
      });
    }, VELOCITY_SETTLE_MS);

    set({
      velocity: Math.round(calculatedVelocity),
      isRapidScrolling: isRapid,
      lastOffset: offset,
      lastTimestamp: now,
      settleTimeoutId: settleTimer,
    });
  },

  reset: () => {
    const state = get();
    if (state.settleTimeoutId !== null) {
      clearTimeout(state.settleTimeoutId);
    }
    set({
      velocity: 0,
      isRapidScrolling: false,
      lastOffset: null,
      lastTimestamp: null,
      settleTimeoutId: null,
    });
  },
}));

export const useIsRapidScrolling = () =>
  useScrollVelocityStore((s) => s.isRapidScrolling);

export const useScrollVelocity = () =>
  useScrollVelocityStore((s) => s.velocity);
