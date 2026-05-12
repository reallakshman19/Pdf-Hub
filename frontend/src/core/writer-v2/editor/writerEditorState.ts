export interface WriterEditorSavePayload {
  editorStateJson: string;
  plainText: string;
}

export const EMPTY_WRITER_EDITOR_STATE_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

export function createPlainTextEditorStateJson(text: string): string {
  const safeText = text ?? '';

  return JSON.stringify({
    root: {
      children: [
        {
          children: safeText
            ? [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: safeText,
                  type: 'text',
                  version: 1,
                },
              ]
            : [],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}

export function normalizeEditorStateJson(
  editorStateJson: string | undefined,
  fallbackPlainText = '',
): string {
  if (!editorStateJson?.trim()) {
    return createPlainTextEditorStateJson(fallbackPlainText);
  }

  try {
    const parsed = JSON.parse(editorStateJson);

    if (parsed?.root?.type === 'root') {
      return editorStateJson;
    }
  } catch {
    // fall through to fallback
  }

  return createPlainTextEditorStateJson(fallbackPlainText);
}

export function plainTextFromSerializedEditorState(editorStateJson: string): string {
  try {
    const parsed = JSON.parse(editorStateJson);
    const chunks: string[] = [];

    collectText(parsed?.root, chunks);

    return chunks.join('').trim();
  } catch {
    return '';
  }
}

function collectText(node: unknown, chunks: string[]): void {
  if (!node || typeof node !== 'object') return;

  const candidate = node as {
    text?: unknown;
    children?: unknown;
  };

  if (typeof candidate.text === 'string') {
    chunks.push(candidate.text);
  }

  if (Array.isArray(candidate.children)) {
    for (const child of candidate.children) {
      collectText(child, chunks);
    }
  }
}
