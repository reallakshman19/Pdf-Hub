import { beforeEach, describe, expect, it } from 'vitest';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';

describe('richEditorCommandQueue', () => {
  beforeEach(() => {
    useRichEditorCommandQueue.getState().clear();
  });

  it('enqueues and drains commands in order', () => {
    useRichEditorCommandQueue.getState().enqueue({
      type: 'applyHeading',
      level: 1,
    });
    useRichEditorCommandQueue.getState().enqueue({
      type: 'insertTable',
      rows: 2,
      cols: 3,
    });
    useRichEditorCommandQueue.getState().enqueue({
      type: 'formatText',
      format: 'bold',
    });
    useRichEditorCommandQueue.getState().enqueue({
      type: 'list',
      command: 'bullet',
    });
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
    });

    expect(useRichEditorCommandQueue.getState().pending).toHaveLength(5);

    const drained = useRichEditorCommandQueue.getState().drain();

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
    });

    useRichEditorCommandQueue.getState().clear();

    expect(useRichEditorCommandQueue.getState().pending).toEqual([]);
  });
});
