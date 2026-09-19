import { describe, expect, it } from 'vitest';

import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import { planHeaderFooterTemplateCommand } from './commandPlan';

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
      page('body-1', 1, '1'),
      page('body-2', 2, '2'),
    ],
    pageLabelRanges: [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'body-1', style: 'decimal' },
    ],
  };
}

function template(): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
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
        id: 'body',
        selector: {
          include: { mode: 'pageLabelRange', startPageId: 'body-1' },
        },
        footer: {
          left: {
            kind: 'image',
            binaryResourceId: 'logo-b',
            widthPt: 40,
          },
          center: {
            kind: 'text',
            template: '{{pageLabel}}',
          },
          right: {
            kind: 'image',
            binaryResourceId: 'logo-a',
            widthPt: 40,
          },
        },
      },
    ],
  };
}

const context = {
  fileName: 'report.pdf',
  now: new Date('2026-09-19T00:00:00.000Z'),
};

describe('header/footer command preflight plan', () => {
  it('returns only matched pages and sorted unique binary resource requirements', () => {
    const value = template();
    value.rules.push({
      id: 'repeat-image',
      selector: {
        include: { mode: 'pageIds', pageIds: ['body-2'] },
      },
      header: {
        right: {
          kind: 'image',
          binaryResourceId: 'logo-a',
          widthPt: 24,
        },
      },
    });

    const result = planHeaderFooterTemplateCommand(value, graph(), context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pages.map((page) => page.pageId)).toEqual([
      'body-1',
      'body-2',
    ]);
    expect(result.requiredBinaryResourceIds).toEqual([
      'logo-a',
      'logo-b',
    ]);
  });

  it('returns a valid no-op plan with a warning when selectors match no pages', () => {
    const value = template();
    value.rules = [
      {
        id: 'none',
        selector: {
          include: { mode: 'pageIds', pageIds: ['cover'] },
          excludeFirstPhysicalPage: true,
        },
        footer: {
          center: {
            kind: 'text',
            template: '{{physicalPage}}',
          },
        },
      },
    ];

    const result = planHeaderFooterTemplateCommand(value, graph(), context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toEqual([]);
    expect(result.warnings).toContain(
      'Header/footer template matches no pages.',
    );
  });

  it('fails closed on stale PageId selectors before resource planning', () => {
    const value = template();
    value.rules[0] = {
      id: 'stale',
      selector: {
        include: { mode: 'pageIds', pageIds: ['missing'] },
      },
      footer: {
        center: {
          kind: 'text',
          template: '{{physicalPage}}',
        },
      },
    };

    const result = planHeaderFooterTemplateCommand(value, graph(), context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/unknown PageId/);
  });
});
