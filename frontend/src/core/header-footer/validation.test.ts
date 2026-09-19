import { describe, expect, it } from 'vitest';

import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import { validateHeaderFooterTemplate } from './validation';

function graph(): PageGraph<PageNode> {
  return {
    pages: [
      page('cover', 0, 'Cover'),
      page('front-1', 1, 'i'),
      page('front-2', 2, 'ii'),
      page('body-1', 3, '1'),
      page('body-2', 4, '2'),
      page('appendix-1', 5, 'A-1'),
    ],
    pageLabelRanges: [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
      { startPageId: 'appendix-1', style: 'decimal', prefix: 'A-' },
    ],
  };
}

function page(
  pageId: string,
  currentIndex: number,
  logicalLabel: string,
): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
    logicalLabel,
  };
}

function professionalTemplate(): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    name: 'Professional numbering',
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Helvetica',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#202020',
      opacity: 1,
    },
    rules: [
      {
        id: 'front-matter',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'front-1' },
          excludeFirstPhysicalPage: true,
        },
        footer: {
          center: {
            kind: 'text',
            template: '{{pageLabel}}',
          },
        },
      },
      {
        id: 'body',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'body-1' },
        },
        footer: {
          right: {
            kind: 'text',
            template: 'Page {{sectionPage}} of {{sectionPageCount}}',
          },
          separator: {
            thicknessPt: 0.5,
            color: '#808080',
          },
        },
      },
      {
        id: 'appendix',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'appendix-1' },
        },
        footer: {
          left: {
            kind: 'text',
            template: 'Appendix A — {{pageLabel}} · {{metadata:project}}',
            style: {
              fontWeight: 'bold',
            },
          },
          right: {
            kind: 'image',
            binaryResourceId: 'company-logo',
            widthPt: 42,
            opacity: 0.9,
            fit: 'contain',
          },
        },
      },
    ],
  };
}

describe('professional header/footer template validation', () => {
  it('accepts a serializable PageLabel-aware template', () => {
    const template = professionalTemplate();
    const result = validateHeaderFooterTemplate(template, graph());

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    expect(() => JSON.stringify(template)).not.toThrow();
  });

  it('accepts explicit PageId and PageId-range selectors', () => {
    const template = professionalTemplate();
    template.rules.push(
      {
        id: 'selected-pages',
        selector: {
          include: { mode: 'pageIds', pageIds: ['body-1', 'body-2'] },
          parity: 'odd',
        },
        header: {
          left: {
            kind: 'text',
            template: '{{fileName}}',
          },
        },
      },
      {
        id: 'range',
        selector: {
          include: {
            mode: 'range',
            startPageId: 'body-2',
            endPageId: 'front-1',
          },
        },
        footer: {
          center: {
            kind: 'text',
            template: '{{physicalPage}} / {{pageCount}}',
          },
        },
      },
    );

    expect(validateHeaderFooterTemplate(template, graph()).valid).toBe(true);
  });

  it('rejects stale PageIds and non-canonical PageLabel range starts', () => {
    const template = professionalTemplate();
    template.rules[0] = {
      id: 'stale-explicit',
      selector: {
        include: { mode: 'pageIds', pageIds: ['missing-page'] },
      },
      footer: {
        center: { kind: 'text', template: '{{pageLabel}}' },
      },
    };
    template.rules[1] = {
      id: 'stale-label-range',
      selector: {
        include: { mode: 'pageLabelRange', startPageId: 'front-2' },
      },
      footer: {
        center: { kind: 'text', template: '{{pageLabel}}' },
      },
    };

    const result = validateHeaderFooterTemplate(template, graph());

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/unknown PageId "missing-page"/);
    expect(result.errors.join('\n')).toMatch(/canonical PageLabel range start/);
  });

  it('rejects duplicate rules, empty bands, and unsupported tokens', () => {
    const template = professionalTemplate();
    template.rules = [
      {
        id: 'duplicate',
        selector: { include: { mode: 'all' } },
        header: {},
      },
      {
        id: 'duplicate',
        selector: { include: { mode: 'all' } },
        footer: {
          right: {
            kind: 'text',
            template: 'Page {{inventedToken}}',
          },
        },
      },
    ];

    const result = validateHeaderFooterTemplate(template, graph());

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/duplicates rule id/);
    expect(result.errors.join('\n')).toMatch(/at least one content slot/);
    expect(result.errors.join('\n')).toMatch(/unsupported token/);
  });

  it('rejects invalid geometry, style, image, and separator values', () => {
    const template = professionalTemplate();
    template.layout.leftMarginPt = -1;
    template.defaultTextStyle.fontSizePt = 0;
    template.defaultTextStyle.color = 'black';
    template.defaultTextStyle.opacity = 2;
    template.rules = [
      {
        id: 'invalid-values',
        selector: { include: { mode: 'all' } },
        header: {
          left: {
            kind: 'image',
            binaryResourceId: '',
            widthPt: 0,
            opacity: -0.1,
          },
          separator: {
            thicknessPt: 0,
            color: '#xyzxyz',
          },
        },
      },
    ];

    const result = validateHeaderFooterTemplate(template, graph());

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/leftMarginPt/);
    expect(result.errors.join('\n')).toMatch(/fontSizePt/);
    expect(result.errors.join('\n')).toMatch(/six-digit hex color/);
    expect(result.errors.join('\n')).toMatch(/between 0 and 1/);
    expect(result.errors.join('\n')).toMatch(/binaryResourceId/);
    expect(result.errors.join('\n')).toMatch(/widthPt/);
    expect(result.errors.join('\n')).toMatch(/thicknessPt/);
  });

  it('warns when first/last exclusions can eliminate all pages', () => {
    const tinyGraph: PageGraph<PageNode> = {
      pages: [page('only', 0, '1')],
      pageLabelRanges: [{ startPageId: 'only', style: 'decimal' }],
    };
    const template = professionalTemplate();
    template.rules = [
      {
        id: 'nothing-left',
        selector: {
          include: { mode: 'all' },
          excludeFirstPhysicalPage: true,
          excludeLastPhysicalPage: true,
        },
        footer: {
          center: { kind: 'text', template: '{{physicalPage}}' },
        },
      },
    ];

    const result = validateHeaderFooterTemplate(template, tinyGraph);

    expect(result.valid).toBe(true);
    expect(result.warnings.join('\n')).toMatch(/may match no pages/);
  });

  it('accepts dynamic metadata and custom-variable tokens', () => {
    const template = professionalTemplate();
    template.rules = [
      {
        id: 'dynamic',
        selector: { include: { mode: 'all' } },
        header: {
          left: {
            kind: 'text',
            template:
              '{{title}} · {{author}} · {{date}} {{time}} · {{metadata:contract}} · {{var:discipline}}',
          },
        },
      },
    ];

    expect(validateHeaderFooterTemplate(template, graph()).valid).toBe(true);
  });
});
