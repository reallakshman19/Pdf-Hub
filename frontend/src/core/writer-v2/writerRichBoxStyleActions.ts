import type { WriterElementV2 } from './types';
import { ensureRichTextEditing } from './ensureRichTextEditing';
import { useWriterV2Store } from './writerV2Store';

export type WriterRichBoxStylePresetId =
  | 'plainWhite'
  | 'reviewCard'
  | 'engineeringNote'
  | 'warningBox'
  | 'transparentOverlay'
  | 'noBorder';

export interface WriterRichBoxStylePreset {
  id: WriterRichBoxStylePresetId;
  label: string;
  style: Partial<WriterElementV2['style']>;
}

export const WRITER_RICH_BOX_STYLE_PRESETS: WriterRichBoxStylePreset[] = [
  {
    id: 'plainWhite',
    label: 'Plain White',
    style: {
      backgroundColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      padding: 10,
      opacity: 1,
    },
  },
  {
    id: 'reviewCard',
    label: 'Review Card',
    style: {
      backgroundColor: '#fff7ed',
      borderColor: '#f97316',
      borderWidth: 1,
      padding: 12,
      opacity: 1,
    },
  },
  {
    id: 'engineeringNote',
    label: 'Engineering Note',
    style: {
      backgroundColor: '#eff6ff',
      borderColor: '#2563eb',
      borderWidth: 1,
      padding: 12,
      opacity: 1,
    },
  },
  {
    id: 'warningBox',
    label: 'Warning Box',
    style: {
      backgroundColor: '#fef2f2',
      borderColor: '#dc2626',
      borderWidth: 2,
      padding: 12,
      opacity: 1,
    },
  },
  {
    id: 'transparentOverlay',
    label: 'Transparent Overlay',
    style: {
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 8,
      opacity: 0.65,
    },
  },
  {
    id: 'noBorder',
    label: 'No Border',
    style: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 8,
      opacity: 1,
    },
  },
];

const RICH_STYLE_TARGET_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'richNote',
]);

export interface WriterRichBoxStyleResult {
  changed: boolean;
  id: string | null;
  message: string;
}

export async function patchActiveRichBoxStyle(
  stylePatch: Partial<WriterElementV2['style']>,
): Promise<WriterRichBoxStyleResult> {
  const id = await ensureRichBoxStyleTarget();

  if (!id) {
    return {
      changed: false,
      id: null,
      message: 'Open a PDF before styling a Writer rich box.',
    };
  }

  const store = useWriterV2Store.getState();
  const element = store.elements.find((item) => item.id === id);

  if (!element) {
    return {
      changed: false,
      id,
      message: 'Writer rich box target was not found.',
    };
  }

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id,
    patch: {
      style: {
        ...element.style,
        ...stylePatch,
      },
    },
  });

  return {
    changed: result.changed,
    id,
    message: result.changed
      ? 'Updated Writer rich box style.'
      : result.reason,
  };
}

export async function applyRichBoxStylePreset(
  presetId: WriterRichBoxStylePresetId,
): Promise<WriterRichBoxStyleResult> {
  const preset = WRITER_RICH_BOX_STYLE_PRESETS.find((item) => item.id === presetId);

  if (!preset) {
    return {
      changed: false,
      id: null,
      message: `Unknown Writer rich box style preset: ${presetId}`,
    };
  }

  return patchActiveRichBoxStyle(preset.style);
}

export function getActiveRichBoxStyleTarget(): WriterElementV2 | null {
  const store = useWriterV2Store.getState();
  const ids = [
    store.activeId,
    ...store.selectedIds,
    store.editingId,
  ].filter(Boolean) as string[];

  for (const id of ids) {
    const element = store.elements.find((item) => item.id === id);

    if (
      element &&
      RICH_STYLE_TARGET_TYPES.has(element.type) &&
      !element.locked &&
      !element.hidden
    ) {
      return element;
    }
  }

  return null;
}

async function ensureRichBoxStyleTarget(): Promise<string | null> {
  const existing = getActiveRichBoxStyleTarget();

  if (existing) {
    useWriterV2Store.getState().beginEditingWriterElement(existing.id);
    return existing.id;
  }

  return ensureRichTextEditing();
}
