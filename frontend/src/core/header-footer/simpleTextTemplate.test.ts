import { describe, expect, it } from 'vitest';

import { createSimpleHeaderFooterTextTemplate } from './simpleTextTemplate';

describe('simple header/footer text template', () => {
  it('creates one canonical PageId-targeted footer slot', () => {
    const template = createSimpleHeaderFooterTextTemplate({
      name: 'Thumbnail page numbers',
      selector: {
        include: {
          mode: 'pageIds',
          pageIds: ['p2', 'p4'],
        },
      },
      zone: 'footer',
      text: 'Page {{physicalPage}} of {{pageCount}}',
      align: 'center',
      marginXPt: 24,
      marginYPt: 20,
      fontSizePt: 10,
      color: '#475569',
      opacity: 0.9,
    });

    expect(template).toEqual({
      schemaVersion: 1,
      name: 'Thumbnail page numbers',
      layout: {
        leftMarginPt: 24,
        rightMarginPt: 24,
        headerOffsetFromTopPt: 20,
        footerOffsetFromBottomPt: 20,
      },
      defaultTextStyle: {
        fontFamily: 'Helvetica',
        fontSizePt: 10,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#475569',
        opacity: 0.9,
      },
      rules: [
        {
          id: 'simple-text',
          selector: {
            include: {
              mode: 'pageIds',
              pageIds: ['p2', 'p4'],
            },
          },
          footer: {
            center: {
              kind: 'text',
              template: 'Page {{physicalPage}} of {{pageCount}}',
            },
          },
        },
      ],
    });
  });

  it('preserves caller-owned selector exclusions for compatibility compilers', () => {
    const template = createSimpleHeaderFooterTextTemplate({
      name: 'Legacy header',
      selector: {
        include: { mode: 'all' },
        parity: 'odd',
        excludeFirstPhysicalPage: true,
      },
      zone: 'header',
      text: '{{fileName}}',
      align: 'right',
      marginXPt: 36,
      marginYPt: 24,
      fontSizePt: 9,
      color: '#374151',
    });

    expect(template.rules[0]?.selector).toEqual({
      include: { mode: 'all' },
      parity: 'odd',
      excludeFirstPhysicalPage: true,
    });
    expect(template.rules[0]?.header?.right).toMatchObject({
      kind: 'text',
      template: '{{fileName}}',
    });
  });

  it('rejects empty content instead of creating an empty band', () => {
    expect(() =>
      createSimpleHeaderFooterTextTemplate({
        name: 'Empty',
        selector: { include: { mode: 'all' } },
        zone: 'footer',
        text: '   ',
        align: 'center',
        marginXPt: 24,
        marginYPt: 20,
        fontSizePt: 10,
        color: '#000000',
      }),
    ).toThrow(/must not be empty/);
  });

  it('forwards startNumber, fontWeight, and fontStyle when customized', () => {
    const template = createSimpleHeaderFooterTextTemplate({
      name: 'Custom numbers',
      selector: { include: { mode: 'all' } },
      zone: 'header',
      text: '{{physicalPage}} / {{pageCount}}',
      align: 'right',
      marginXPt: 36,
      marginYPt: 28,
      fontFamily: 'Courier',
      fontSizePt: 11,
      fontWeight: 'bold',
      fontStyle: 'italic',
      color: '#111827',
      startNumber: 10,
    });

    expect(template.defaultTextStyle).toMatchObject({
      fontFamily: 'Courier',
      fontSizePt: 11,
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    expect(template.rules[0]?.startNumber).toBe(10);
    expect(template.rules[0]?.header?.right).toMatchObject({
      kind: 'text',
      template: '{{physicalPage}} / {{pageCount}}',
    });
  });
});
