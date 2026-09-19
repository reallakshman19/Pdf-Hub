import { describe, expect, it } from 'vitest';

import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import { resolveHeaderFooterTemplate } from './resolver';

function page(
  pageId: string,
  currentIndex: number,
  logicalLabel?: string,
): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
    ...(logicalLabel ? { logicalLabel } : {}),
  };
}

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

function template(): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    name: 'Sectioned footer',
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Inter',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#202020',
      opacity: 1,
    },
    rules: [
      {
        id: 'front',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'front-1' },
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
            style: { fontWeight: 'bold' },
          },
          right: {
            kind: 'image',
            binaryResourceId: 'logo',
            widthPt: 40,
          },
        },
      },
    ],
  };
}

const context = {
  fileName: 'report.pdf',
  title: 'Project Report',
  author: 'PDF Hub',
  now: new Date('2026-09-19T10:11:12.000Z'),
  metadata: { project: 'Orion' },
  variables: { discipline: 'Process' },
};

describe('professional header/footer template resolution', () => {
  it('resolves front matter, body, and appendix content independently of PageLabels storage', () => {
    const result = resolveHeaderFooterTemplate(template(), graph(), context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pages[0]?.footer).toBeUndefined();
    expect(result.pages[1]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'i',
    });
    expect(result.pages[2]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'ii',
    });
    expect(result.pages[3]?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'Page 1 of 2',
    });
    expect(result.pages[4]?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'Page 2 of 2',
    });
    expect(result.pages[5]?.footer?.left).toMatchObject({
      kind: 'text',
      text: 'Appendix A — A-1 · Orion',
      style: expect.objectContaining({ fontWeight: 'bold' }),
    });
    expect(result.pages[5]?.footer?.right).toEqual({
      kind: 'image',
      binaryResourceId: 'logo',
      widthPt: 40,
      opacity: 1,
      fit: 'contain',
    });
  });

  it('uses ordered rules so later rules override only the slots they define', () => {
    const value = template();
    value.rules = [
      {
        id: 'base',
        selector: { include: { mode: 'all' } },
        header: {
          left: { kind: 'text', template: '{{fileName}}' },
        },
        footer: {
          center: { kind: 'text', template: '{{physicalPage}}' },
        },
      },
      {
        id: 'body-override',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'body-1' },
        },
        header: {
          left: { kind: 'text', template: '{{title}}' },
        },
        footer: {
          right: { kind: 'text', template: '{{author}}' },
        },
      },
    ];

    const result = resolveHeaderFooterTemplate(value, graph(), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = result.pages[3];
    expect(body?.header?.left).toMatchObject({
      kind: 'text',
      text: 'Project Report',
    });
    expect(body?.footer?.center).toMatchObject({
      kind: 'text',
      text: '4',
    });
    expect(body?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'PDF Hub',
    });
  });

  it('resolves deterministic UTC date/time unless explicit formatted values are provided', () => {
    const value = template();
    value.rules = [
      {
        id: 'date',
        selector: { include: { mode: 'pageIds', pageIds: ['cover'] } },
        header: {
          left: {
            kind: 'text',
            template: '{{date}} {{time}}',
          },
        },
      },
    ];

    const defaultResult = resolveHeaderFooterTemplate(value, graph(), context);
    expect(defaultResult.ok).toBe(true);
    if (!defaultResult.ok) return;
    expect(defaultResult.pages[0]?.header?.left).toMatchObject({
      kind: 'text',
      text: '2026-09-19 10:11:12Z',
    });

    const formattedResult = resolveHeaderFooterTemplate(value, graph(), {
      ...context,
      dateText: '19 Sep 2026',
      timeText: '14:11',
    });
    expect(formattedResult.ok).toBe(true);
    if (!formattedResult.ok) return;
    expect(formattedResult.pages[0]?.header?.left).toMatchObject({
      kind: 'text',
      text: '19 Sep 2026 14:11',
    });
  });

  it('deduplicates warnings for missing dynamic metadata across matching pages', () => {
    const value = template();
    value.rules = [
      {
        id: 'missing',
        selector: { include: { mode: 'all' } },
        footer: {
          left: {
            kind: 'text',
            template: '{{metadata:missing}} / {{var:missing}}',
          },
        },
      },
    ];

    const result = resolveHeaderFooterTemplate(value, graph(), {
      ...context,
      metadata: {},
      variables: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      'Header/footer metadata token has no value: missing',
      'Header/footer variable token has no value: missing',
    ]);
  });

  it('falls back to physical labels and document-wide section numbering without PageLabels', () => {
    const noLabels: PageGraph<PageNode> = {
      pages: [page('a', 0), page('b', 1)],
    };
    const value = template();
    value.rules = [
      {
        id: 'fallback',
        selector: { include: { mode: 'all' } },
        footer: {
          center: {
            kind: 'text',
            template:
              '{{pageLabel}} · {{sectionPage}} of {{sectionPageCount}}',
          },
        },
      },
    ];

    const result = resolveHeaderFooterTemplate(value, noLabels, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pages[0]?.footer?.center).toMatchObject({
      kind: 'text',
      text: '1 · 1 of 2',
    });
    expect(result.pages[1]?.footer?.center).toMatchObject({
      kind: 'text',
      text: '2 · 2 of 2',
    });
  });

  it('fails closed when the template or execution time is invalid', () => {
    const invalidTemplate = template();
    invalidTemplate.rules[0] = {
      id: 'stale',
      selector: {
        include: { mode: 'pageIds', pageIds: ['missing'] },
      },
      footer: {
        center: { kind: 'text', template: '{{physicalPage}}' },
      },
    };

    const badTemplateResult = resolveHeaderFooterTemplate(
      invalidTemplate,
      graph(),
      context,
    );
    expect(badTemplateResult.ok).toBe(false);

    const badTimeResult = resolveHeaderFooterTemplate(template(), graph(), {
      ...context,
      now: new Date('invalid'),
    });
    expect(badTimeResult.ok).toBe(false);
    if (badTimeResult.ok) return;
    expect(badTimeResult.errors.join('\n')).toMatch(/valid Date/);
  });
});
