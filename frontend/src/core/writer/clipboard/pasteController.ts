import type { PlacedElement } from '../types';
import {
  clipboardPayloadToElements,
} from './clipboardToElements';
import {
  payloadFromClipboardEvent,
  readNavigatorClipboardPayload,
} from './readClipboard';
import type {
  ClipboardElementPlacement,
  ClipboardToElementsResult,
} from './types';

export interface WriterPasteControllerOptions {
  getPlacement: () => ClipboardElementPlacement;
  addElements: (elements: PlacedElement[]) => void;
  onWarning?: (message: string) => void;
}

export function createWriterPasteController(options: WriterPasteControllerOptions) {
  return {
    async pasteFromNavigator(): Promise<ClipboardToElementsResult> {
      const payload = await readNavigatorClipboardPayload();
      const result = clipboardPayloadToElements(payload, options.getPlacement());

      if (result.warning) options.onWarning?.(result.warning);
      if (result.elements.length > 0) options.addElements(result.elements);

      return result;
    },

    pasteFromClipboardEvent(event: ClipboardEvent): ClipboardToElementsResult {
      if (shouldIgnorePasteTarget(event.target)) {
        return {
          elements: [],
          warning: 'Paste ignored because target is editable.',
        };
      }

      const payload = payloadFromClipboardEvent(event);
      const result = clipboardPayloadToElements(payload, options.getPlacement());

      if (result.elements.length > 0) {
        event.preventDefault();
        options.addElements(result.elements);
      }

      if (result.warning) options.onWarning?.(result.warning);

      return result;
    },
  };
}

export function shouldIgnorePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    Boolean(target.closest('[data-writer-allow-native-paste="true"]')) ||
    Boolean(target.closest('[data-macro-builder="true"]'))
  );
}
