import { describe, expect, it, vi } from 'vitest';
import { documentBus, useDocumentEventBus } from './bus';

describe('core/events/bus', () => {
  it('delivers emitted events to subscribers and stops after unsubscribe', () => {
    const handler = vi.fn();
    const unsubscribe = documentBus.subscribe(handler);

    documentBus.emit({ type: 'PAGES_REORDERED', order: [1, 0] });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'PAGES_REORDERED', order: [1, 0] });

    unsubscribe();
    documentBus.emit({ type: 'PAGES_REORDERED', order: [0, 1] });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('exposes bound emit and subscribe wrappers via useDocumentEventBus', () => {
    const bus = useDocumentEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);
    bus.emit({ type: 'DOCUMENT_REPLACED' });
    expect(handler).toHaveBeenCalledWith({ type: 'DOCUMENT_REPLACED' });
    unsubscribe();
  });
});
