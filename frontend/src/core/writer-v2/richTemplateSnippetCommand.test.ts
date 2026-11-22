import { beforeEach, describe, expect, it } from 'vitest';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import { useWriterV2Store } from './writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { createRichTextBoxElement } from './writerElementFactory';
import { captureRichEditorOwner, type RichEditorOwner } from './editor/richEditorOwnership';

let owner: RichEditorOwner;

describe('rich template snippet command', () => {
  beforeEach(() => {
    useRichEditorCommandQueue.getState().clear();
    useSessionStore.getState().clearDocument();
    const store = useWriterV2Store.getState();
    const meta = store.createBlankWriterDocument({ documentFingerprint: 'queue-test' });
    const element = createRichTextBoxElement({ documentFingerprint: meta.documentFingerprint, pageIndex: 0, rect: { x: 10, y: 10, width: 100, height: 80 } });
    useWriterV2Store.getState().dispatchWriterCommand({ type: 'ADD_WRITER_ELEMENT', element });
    useWriterV2Store.getState().beginEditingWriterElement(element.id);
    owner = captureRichEditorOwner(useWriterV2Store.getState().elements[0]);
  });

  it('queues a rich template snippet command', () => {
    useRichEditorCommandQueue.getState().enqueue({
      type: 'insertTemplateSnippet',
      blocks: [
        {
          kind: 'heading',
          level: 2,
          text: 'APPROVED',
          style: 'color: #047857; font-size: 22px',
        },
        {
          kind: 'paragraph',
          text: 'Status: approved',
        },
      ],
    }, owner);

    const drained = useRichEditorCommandQueue.getState().drain(owner);

    expect(drained).toEqual([
      {
        type: 'insertTemplateSnippet',
        blocks: [
          {
            kind: 'heading',
            level: 2,
            text: 'APPROVED',
            style: 'color: #047857; font-size: 22px',
          },
          {
            kind: 'paragraph',
            text: 'Status: approved',
          },
        ],
      },
    ]);
  });
});
