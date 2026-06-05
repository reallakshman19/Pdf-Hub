import { describe, expect, it } from 'vitest';
import { editorStateToPdfBlocks } from './richTextRenderer';

describe('richTextRenderer rich table/image blocks', () => {
  it('parses table and inline image blocks from Lexical JSON', () => {
    const blocks = editorStateToPdfBlocks(
      JSON.stringify({
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'table',
              version: 1,
              children: [
                {
                  type: 'tablerow',
                  version: 1,
                  children: [
                    {
                      type: 'tablecell',
                      version: 1,
                      children: [
                        {
                          type: 'paragraph',
                          version: 1,
                          children: [
                            {
                              type: 'text',
                              version: 1,
                              text: 'A1',
                              format: 0,
                              style: '',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'inline-image',
              version: 1,
              src: 'data:image/png;base64,AA==',
              altText: 'Image alt',
              width: 120,
              height: 60,
              caption: 'Caption text',
            },
          ],
        },
      }),
      '',
    );

    expect(blocks[0].type).toBe('table');
    expect(blocks[1]).toMatchObject({
      type: 'image',
      src: 'data:image/png;base64,AA==',
      altText: 'Image alt',
      width: 120,
      height: 60,
      caption: 'Caption text',
    });
  });
});
