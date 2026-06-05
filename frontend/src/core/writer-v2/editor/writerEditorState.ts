import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

export interface WriterEditorSavePayload {
  editorStateJson: string;
  plainText: string;
  assets?: WriterAssetRecordV2[];
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

export type WriterStarterTemplateId =
  | 'blank'
  | 'authoringCard'
  | 'reviewComment'
  | 'engineeringNote';

export function createWriterStarterEditorStateJson(
  templateId: WriterStarterTemplateId,
): string {
  switch (templateId) {
    case 'authoringCard':
      return createStructuredEditorStateJson([
        headingNode('Document Heading', 'h1'),
        paragraphNode('Write your content here. Use the ribbon to add tables, images, lists, colors, and review comments.'),
        paragraphNode('Action / comment: '),
      ]);

    case 'reviewComment':
      return createStructuredEditorStateJson([
        headingNode('Review Comment', 'h2'),
        paragraphNode('Observation: '),
        paragraphNode('Required action: '),
        paragraphNode('Status: Open'),
      ]);

    case 'engineeringNote':
      return createStructuredEditorStateJson([
        headingNode('Engineering Note', 'h2'),
        paragraphNode('Reference: '),
        paragraphNode('Finding: '),
        paragraphNode('Recommendation: '),
      ]);

    case 'blank':
    default:
      return createPlainTextEditorStateJson('');
  }
}

function createStructuredEditorStateJson(
  children: Array<Record<string, unknown>>,
): string {
  return JSON.stringify({
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}

function headingNode(
  text: string,
  tag: 'h1' | 'h2' | 'h3',
): Record<string, unknown> {
  return {
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
    type: 'heading',
    version: 1,
    tag,
  };
}

function paragraphNode(text: string): Record<string, unknown> {
  return {
    children: text ? [textNode(text)] : [],
    direction: null,
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
    textFormat: 0,
    textStyle: '',
  };
}

function textNode(text: string): Record<string, unknown> {
  return {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  };
}
