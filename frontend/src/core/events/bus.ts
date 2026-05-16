import type { DocumentEvent } from './types';

type EventHandler = (event: DocumentEvent) => void;

/**
 * Typed document event bus — pure EventTarget-based pub/sub.
 * Owner: Agent A creates; all agents subscribe or emit.
 *
 * Usage:
 *   // Subscribe (returns unsubscribe fn):
 *   const unsub = documentBus.subscribe(event => { ... });
 *   // Emit:
 *   documentBus.emit({ type: 'PAGES_REORDERED', order: [2,0,1] });
 */
class DocumentEventBus {
  private readonly target = new EventTarget();
  private readonly EVENT_KEY = 'doc-event';

  emit(event: DocumentEvent): void {
    this.target.dispatchEvent(
      Object.assign(new Event(this.EVENT_KEY), { payload: event }),
    );
  }

  subscribe(handler: EventHandler): () => void {
    const listener = (e: Event) => {
      handler((e as Event & { payload: DocumentEvent }).payload);
    };
    this.target.addEventListener(this.EVENT_KEY, listener);
    return () => this.target.removeEventListener(this.EVENT_KEY, listener);
  }
}

export const documentBus = new DocumentEventBus();

// React hook wrapper — usable inside components or store initializers
export function useDocumentEventBus() {
  return {
    emit: documentBus.emit.bind(documentBus),
    subscribe: documentBus.subscribe.bind(documentBus),
  };
}
