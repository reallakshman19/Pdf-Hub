import { describe, it, expect } from 'vitest';
import { editorStateToPdfBlocks } from './richTextRenderer';

describe('richTextRenderer Parser', () => {
  it('Scenario 1: should handle empty or null state by falling back to paragraph', () => {
    const blocks = editorStateToPdfBlocks(null, 'Fallback text');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ text: 'Fallback text', style: {} }],
    });
  });

  it('Scenario 2: should handle malformed JSON gracefully', () => {
    const blocks = editorStateToPdfBlocks('{invalid-json}', 'Fallback text');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ text: 'Fallback text', style: {} }],
    });
  });

  it('Scenario 3: should parse a simple paragraph with plain text', () => {
    const json = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Hello world',
                format: 0,
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      alignment: undefined,
      indent: undefined,
      children: [{ text: 'Hello world', style: { bold: false, italic: false, underline: false, strikethrough: false } }],
    });
  });

  it('Scenario 4: should extract bitwise text formats correctly', () => {
    const json = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Bold and Italic',
                format: 3, // bold (1) + italic (2)
              },
              {
                type: 'text',
                text: 'Underline and Strikethrough',
                format: 12, // underline (4) + strikethrough (8)
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    const pBlock = blocks[0];
    if (pBlock.type !== 'paragraph') throw new Error('Expected paragraph');
    expect(pBlock.children).toHaveLength(2);
    expect(pBlock.children[0]).toEqual({
      text: 'Bold and Italic',
      style: { bold: true, italic: true, underline: false, strikethrough: false },
    });
    expect(pBlock.children[1]).toEqual({
      text: 'Underline and Strikethrough',
      style: { bold: false, italic: false, underline: true, strikethrough: true },
    });
  });

  it('Scenario 5: should parse inline CSS style parameters', () => {
    const json = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Styled Text',
                format: 0,
                style: 'color: rgb(255, 0, 0); background-color: #00ff00; font-family: IBM Plex Sans; font-size: 16px',
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    const pBlock = blocks[0];
    if (pBlock.type !== 'paragraph') throw new Error('Expected paragraph');
    expect(pBlock.children[0].style).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: 'rgb(255, 0, 0)',
      backgroundColor: '#00ff00',
      fontFamily: 'IBM Plex Sans',
      fontSize: 16,
    });
  });

  it('Scenario 6: should parse heading tags (h1, h2, h3) and format alignments', () => {
    const json = {
      root: {
        children: [
          {
            type: 'heading',
            tag: 'h1',
            format: 'center',
            children: [
              {
                type: 'text',
                text: 'My Heading',
                format: 1, // bold
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'heading',
      tag: 'h1',
      alignment: 'center',
      children: [{ text: 'My Heading', style: { bold: true, italic: false, underline: false, strikethrough: false } }],
    });
  });

  it('Scenario 7: should parse unordered/ordered list structures with indents', () => {
    const json = {
      root: {
        children: [
          {
            type: 'list',
            listType: 'number',
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [
                  {
                    type: 'text',
                    text: 'Step one',
                    format: 0,
                  },
                ],
              },
              {
                type: 'listitem',
                value: 2,
                children: [
                  {
                    type: 'text',
                    text: 'Step two',
                    format: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'list',
      listType: 'number',
      items: [
        { indent: 1, children: [{ text: 'Step one', style: { bold: false, italic: false, underline: false, strikethrough: false } }] },
        { indent: 2, children: [{ text: 'Step two', style: { bold: false, italic: false, underline: false, strikethrough: false } }] },
      ],
    });
  });

  it('Scenario 8: should parse nested table, tablerow, tablecell, and internal blocks', () => {
    const json = {
      root: {
        children: [
          {
            type: 'table',
            children: [
              {
                type: 'tablerow',
                children: [
                  {
                    type: 'tablecell',
                    children: [
                      {
                        type: 'paragraph',
                        children: [
                          {
                            type: 'text',
                            text: 'Cell A1',
                            format: 0,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('table');
    const table = blocks[0];
    expect(table.type).toBe('table');
    if (table.type === 'table') {
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0].cells).toHaveLength(1);
      expect(table.rows[0].cells[0].children[0]).toEqual({
        type: 'paragraph',
        alignment: undefined,
        indent: undefined,
        children: [{ text: 'Cell A1', style: { bold: false, italic: false, underline: false, strikethrough: false } }],
      });
    }
  });

  it('Scenario 9: should parse custom inline-image nodes with dimensions and captions', () => {
    const json = {
      root: {
        children: [
          {
            type: 'inline-image',
            src: 'data:image/png;base64,iVBORw0KGgo...',
            altText: 'Mock alt text',
            width: 250,
            height: 150,
            caption: 'Test caption',
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'image',
      src: 'data:image/png;base64,iVBORw0KGgo...',
      altText: 'Mock alt text',
      width: 250,
      height: 150,
      caption: 'Test caption',
    });
  });

  it('Scenario 10: should parse paragraph with linebreaks and text formats', () => {
    const json = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Line 1',
                format: 1,
              },
              {
                type: 'linebreak',
              },
              {
                type: 'text',
                text: 'Line 2',
                format: 2,
              },
            ],
          },
        ],
      },
    };
    const blocks = editorStateToPdfBlocks(JSON.stringify(json), 'Fallback');
    const pBlock = blocks[0];
    if (pBlock.type !== 'paragraph') throw new Error('Expected paragraph');
    expect(pBlock.children).toHaveLength(3);
    expect(pBlock.children[0]).toEqual({ text: 'Line 1', style: { bold: true, italic: false, underline: false, strikethrough: false } });
    expect(pBlock.children[1]).toEqual({ text: '\n', style: {} });
    expect(pBlock.children[2]).toEqual({ text: 'Line 2', style: { bold: false, italic: true, underline: false, strikethrough: false } });
  });
});
