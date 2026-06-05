import { beforeEach, describe, expect, it } from 'vitest';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';

describe('rich template snippet command', () => {
  beforeEach(() => {
    useRichEditorCommandQueue.getState().clear();
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
    });

    const drained = useRichEditorCommandQueue.getState().drain();

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
