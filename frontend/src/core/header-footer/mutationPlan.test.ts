import { describe, expect, it } from 'vitest';

import type { ResolvedHeaderFooterPage } from './resolutionTypes';
import { compileHeaderFooterMutationPlan } from './mutationPlan';

function resolvedPage(): ResolvedHeaderFooterPage {
  return {
    pageId: 'stable-page-id',
    physicalPageNumber: 2,
    logicalPageLabel: 'A-7',
    sectionPageNumber: 3,
    sectionPageCount: 9,
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 42,
      headerOffsetFromTopPt: 20,
      footerOffsetFromBottomPt: 24,
    },
    header: {
      left: {
        kind: 'text',
        text: 'Resolved header',
        style: {
          fontFamily: 'Times New Roman',
          fontSizePt: 11,
          fontWeight: 'bold',
          fontStyle: 'italic',
          color: '#112233',
          opacity: 0.75,
        },
      },
      separator: {
        thicknessPt: 0.5,
        color: '#808080',
        opacity: 0.8,
        insetLeftPt: 2,
        insetRightPt: 3,
      },
    },
    footer: {
      right: {
        kind: 'image',
        binaryResourceId: 'logo',
        widthPt: 24,
        heightPt: 18,
        opacity: 0.9,
        fit: 'contain',
        altText: 'Company logo',
      },
    },
  };
}

describe('header/footer mutation plan compiler', () => {
  it('strips product metadata and emits physical engine operations', () => {
    const [compiled] = compileHeaderFooterMutationPlan([
      resolvedPage(),
    ]);

    expect(compiled).toEqual({
      pageIndex: 1,
      layout: {
        leftMarginPt: 36,
        rightMarginPt: 42,
        headerOffsetFromTopPt: 20,
        footerOffsetFromBottomPt: 24,
      },
      header: {
        left: {
          kind: 'text',
          text: 'Resolved header',
          style: {
            fontFamily: 'Times New Roman',
            fontSizePt: 11,
            fontWeight: 'bold',
            fontStyle: 'italic',
            color: '#112233',
            opacity: 0.75,
          },
        },
        separator: {
          thicknessPt: 0.5,
          color: '#808080',
          opacity: 0.8,
          insetLeftPt: 2,
          insetRightPt: 3,
        },
      },
      footer: {
        right: {
          kind: 'image',
          binaryResourceId: 'logo',
          widthPt: 24,
          heightPt: 18,
          opacity: 0.9,
          fit: 'contain',
        },
      },
    });

    expect(compiled).not.toHaveProperty('pageId');
    expect(compiled).not.toHaveProperty('logicalPageLabel');
    expect(compiled).not.toHaveProperty('sectionPageNumber');
    expect(compiled).not.toHaveProperty('sectionPageCount');
    expect(compiled?.footer?.right).not.toHaveProperty(
      'altText',
    );
  });

  it('converts physical page numbers to zero-based page indices', () => {
    const pages = [
      resolvedPage(),
      {
        ...resolvedPage(),
        pageId: 'second-id',
        physicalPageNumber: 5,
      },
    ];

    expect(
      compileHeaderFooterMutationPlan(pages).map(
        (page) => page.pageIndex,
      ),
    ).toEqual([1, 4]);
  });
});
