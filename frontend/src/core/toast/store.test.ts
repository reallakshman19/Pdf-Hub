import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './store';

describe('core/toast/store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds, updates, and removes toasts cleanly', () => {
    const id = useToastStore.getState().addToast({
      type: 'progress',
      title: 'Exporting',
      progress: 10,
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ id, title: 'Exporting', progress: 10 });

    useToastStore.getState().updateToast(id, { progress: 85, message: 'Almost done' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ progress: 85, message: 'Almost done' });

    // Progress toast without duration does not auto-dismiss
    vi.advanceTimersByTime(10_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses success/info after default 3000ms and honors explicit duration, while keeping error toasts', () => {
    useToastStore.getState().addToast({ type: 'success', title: 'Saved' });
    useToastStore.getState().addToast({ type: 'error', title: 'Failed' });
    useToastStore.getState().addToast({ type: 'info', title: 'Brief', duration: 500 });

    vi.advanceTimersByTime(500);
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(['Saved', 'Failed']);

    vi.advanceTimersByTime(2500);
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(['Failed']);
  });
});
