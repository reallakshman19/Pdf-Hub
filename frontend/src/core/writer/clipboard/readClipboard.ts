import type { WriterClipboardPayload } from './types';
import { parseClipboardTableFromHtml, parseClipboardTableFromText } from './parseClipboardTable';
import { parseClipboardRichTextFromHtml } from './parseClipboardHtml';
import { blobToClipboardImage, isClipboardImageType } from './parseClipboardImage';

export async function readNavigatorClipboardPayload(): Promise<WriterClipboardPayload> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return {
      kind: 'unsupported',
      warning: 'Navigator clipboard API is not available.',
    };
  }

  const navClipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>;
  };

  if (typeof navClipboard.read === 'function') {
    try {
      const items = await navClipboard.read();

      for (const item of items) {
        const imageType = item.types.find(isClipboardImageType);

        if (imageType) {
          const blob = await item.getType(imageType);
          return {
            kind: 'image',
            image: await blobToClipboardImage(blob),
            mimeType: imageType,
          };
        }
      }

      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          const html = await blob.text();
          const table = parseClipboardTableFromHtml(html);

          if (table) {
            return {
              kind: 'table',
              html,
              table,
              mimeType: 'text/html',
            };
          }

          return {
            kind: 'html',
            html,
            richText: parseClipboardRichTextFromHtml(html),
            mimeType: 'text/html',
          };
        }
      }

      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          return textPayload(await blob.text());
        }
      }
    } catch (err) {
      return {
        kind: 'unsupported',
        warning: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (typeof navigator.clipboard.readText === 'function') {
    try {
      return textPayload(await navigator.clipboard.readText());
    } catch (err) {
      return {
        kind: 'unsupported',
        warning: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    kind: 'unsupported',
    warning: 'Clipboard read is not supported.',
  };
}

export function payloadFromClipboardEvent(event: ClipboardEvent): WriterClipboardPayload {
  const data = event.clipboardData;

  if (!data) {
    return { kind: 'empty' };
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && isClipboardImageType(item.type)) {
      const file = item.getAsFile();

      if (file) {
        return {
          kind: 'unsupported',
          warning: 'Image clipboard item detected. Use async image paste handler.',
          mimeType: item.type,
        };
      }
    }
  }

  const html = data.getData('text/html');

  if (html) {
    const table = parseClipboardTableFromHtml(html);

    if (table) {
      return {
        kind: 'table',
        html,
        table,
        mimeType: 'text/html',
      };
    }

    return {
      kind: 'html',
      html,
      richText: parseClipboardRichTextFromHtml(html),
      mimeType: 'text/html',
    };
  }

  const text = data.getData('text/plain');
  return textPayload(text);
}

function textPayload(text: string): WriterClipboardPayload {
  if (!text) {
    return { kind: 'empty' };
  }

  const table = parseClipboardTableFromText(text);

  if (table) {
    return {
      kind: 'table',
      plainText: text,
      table,
      mimeType: 'text/plain',
    };
  }

  return {
    kind: 'plain-text',
    plainText: text,
    mimeType: 'text/plain',
  };
}
