import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Document, Packer } from 'docx';
import type { PortableTableBlock } from './types';
import { renderTableBlock } from './renderTableBlock';

describe('renderTableBlock professional table properties', () => {
  it('emits DOCX XML for alignment, vertical alignment, shading, borders, and width', async () => {
    const table: PortableTableBlock = {
      type: 'table',
      rows: [
        {
          cells: [
            {
              width: 160,
              style: {
                alignment: 'center',
                verticalAlign: 'middle',
                backgroundColor: '#FEF3C7',
                padding: 6,
                borders: {
                  top: { style: 'single', color: '#111827', width: 0.5 },
                  right: { style: 'dashed', color: '#111827', width: 0.5 },
                  bottom: { style: 'double', color: '#92400E', width: 1 },
                  left: { style: 'dotted', color: '#111827', width: 0.5 },
                },
              },
              children: [
                {
                  type: 'paragraph',
                  alignment: 'center',
                  children: [
                    {
                      text: 'Styled cell',
                      style: {
                        bold: true,
                        color: '#111827',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const document = new Document({
      sections: [
        {
          children: [
            renderTableBlock(table),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(document);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')!.async('string');

    expect(documentXml).toContain('Styled cell');
    expect(documentXml).toMatch(/<w:tbl[\s>]/);
    expect(documentXml).toMatch(/<w:tcW[\s>]/);
    expect(documentXml).toMatch(/<w:vAlign[^>]+w:val="center"/);
    expect(documentXml).toMatch(/<w:shd[^>]+w:fill="FEF3C7"/);
    expect(documentXml).toMatch(/<w:tcBorders[\s>]/);
    expect(documentXml).toMatch(/<w:top[^>]+w:val="single"/);
    expect(documentXml).toMatch(/<w:right[^>]+w:val="dashed"/);
    expect(documentXml).toMatch(/<w:bottom[^>]+w:val="double"/);
    expect(documentXml).toMatch(/<w:left[^>]+w:val="dotted"/);
    expect(documentXml).toMatch(/<w:jc[^>]+w:val="center"/);

    expect(documentXml).not.toContain('[object Object]');
    expect(documentXml).not.toContain('undefined');
  });
});
