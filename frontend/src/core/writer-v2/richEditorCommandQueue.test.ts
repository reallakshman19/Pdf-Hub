import { beforeEach, describe, expect, it } from 'vitest';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import { useWriterV2Store } from './writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { createRichTextBoxElement } from './writerElementFactory';
import { captureRichEditorOwner, type RichEditorOwner } from './editor/richEditorOwnership';

let owner: RichEditorOwner;

describe('richEditorCommandQueue', () => {
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

  it('enqueues and drains commands in order', () => {
    useRichEditorCommandQueue.getState().enqueue({
      type: 'applyHeading',
      level: 1,
    }, owner);
    useRichEditorCommandQueue.getState().enqueue({
      type: 'insertTable',
      rows: 2,
      cols: 3,
    }, owner);
    useRichEditorCommandQueue.getState().enqueue({
      type: 'formatText',
      format: 'bold',
    }, owner);
    useRichEditorCommandQueue.getState().enqueue({
      type: 'list',
      command: 'bullet',
    }, owner);
    useRichEditorCommandQueue.getState().enqueue({
      type: 'insertTemplateSnippet',
      blocks: [
        {
          kind: 'heading',
          level: 2,
          text: 'REVIEWED',
          style: 'color: #047857',
        },
      ],
    }, owner);

    expect(useRichEditorCommandQueue.getState().pending).toHaveLength(5);

    const drained = useRichEditorCommandQueue.getState().drain(owner);

    expect(drained).toEqual([
      {
        type: 'applyHeading',
        level: 1,
      },
      {
        type: 'insertTable',
        rows: 2,
        cols: 3,
      },
      {
        type: 'formatText',
        format: 'bold',
      },
      {
        type: 'list',
        command: 'bullet',
      },
      {
        type: 'insertTemplateSnippet',
        blocks: [
          {
            kind: 'heading',
            level: 2,
            text: 'REVIEWED',
            style: 'color: #047857',
          },
        ],
      },
    ]);
    expect(useRichEditorCommandQueue.getState().pending).toEqual([]);
  });

  it('clears queued commands', () => {
    useRichEditorCommandQueue.getState().enqueue({
      type: 'focus',
    }, owner);

    useRichEditorCommandQueue.getState().clear();

    expect(useRichEditorCommandQueue.getState().pending).toEqual([]);
  });
  it('does not pass a command to a reopened same-fingerprint editor', () => {
    useRichEditorCommandQueue.getState().enqueue({ type: 'formatText', format: 'bold' }, owner);
    useWriterV2Store.getState().endEditingWriterElement();
    useWriterV2Store.getState().beginEditingWriterElement(owner.target.id);
    const reopened = captureRichEditorOwner(useWriterV2Store.getState().elements[0]);
    expect(useRichEditorCommandQueue.getState().drain(reopened)).toEqual([]);
  });

});
