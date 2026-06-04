import { describe, it, expect } from 'vitest';
import { editorStateToPdfBlocks } from './richTextRenderer';

function makeState(root: object): string {
  return JSON.stringify({ root: { type: 'root', children: [root], direction: null, format: '', indent: 0, version: 1 } });
}

describe('richTextRenderer — links and checklists', () => {
  it('propagates href from link node to inline text runs', () => {
    const state = makeState({
      type: 'paragraph',
      children: [
        {
          type: 'link',
          url: 'https://example.com',
          children: [
            { type: 'text', text: 'click here', format: 0, style: '' },
          ],
        },
      ],
      format: '',
      indent: 0,
      version: 1,
    });

    const blocks = editorStateToPdfBlocks(state, '');
    expect(blocks).toHaveLength(1);
    const para = blocks[0];
    expect(para.type).toBe('paragraph');
    if (para.type === 'paragraph') {
      expect(para.children).toHaveLength(1);
      expect(para.children[0].text).toBe('click here');
      expect(para.children[0].href).toBe('https://example.com');
    }
  });

  it('returns listType "check" for checklist nodes', () => {
    const state = makeState({
      type: 'list',
      listType: 'check',
      listStyleType: 'check',
      children: [
        {
          type: 'listitem',
          checked: true,
          children: [{ type: 'text', text: 'done', format: 0, style: '' }],
          value: 1,
        },
        {
          type: 'listitem',
          checked: false,
          children: [{ type: 'text', text: 'pending', format: 0, style: '' }],
          value: 2,
        },
      ],
      format: '',
      indent: 0,
      version: 1,
    });

    const blocks = editorStateToPdfBlocks(state, '');
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    expect(list.type).toBe('list');
    if (list.type === 'list') {
      expect(list.listType).toBe('check');
      expect(list.items[0].checked).toBe(true);
      expect(list.items[1].checked).toBe(false);
    }
  });

  it('mixed text and link runs in the same paragraph', () => {
    const state = makeState({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Visit ', format: 0, style: '' },
        {
          type: 'link',
          url: 'https://pdfhub.app',
          children: [{ type: 'text', text: 'PDF Hub', format: 1, style: '' }],
        },
        { type: 'text', text: ' for more.', format: 0, style: '' },
      ],
      format: '',
      indent: 0,
      version: 1,
    });

    const blocks = editorStateToPdfBlocks(state, '');
    expect(blocks[0].type).toBe('paragraph');
    if (blocks[0].type === 'paragraph') {
      const children = blocks[0].children;
      expect(children[0].href).toBeUndefined();
      expect(children[1].href).toBe('https://pdfhub.app');
      expect(children[1].style.bold).toBe(true);
      expect(children[2].href).toBeUndefined();
    }
  });
});
