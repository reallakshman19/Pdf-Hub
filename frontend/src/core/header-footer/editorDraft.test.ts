import { describe, expect, it } from 'vitest';

import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  compileHeaderFooterEditorDraft,
  createDefaultHeaderFooterEditorDraft,
} from './editorDraft';

function page(pageId: string, currentIndex: number): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 595,
    height: 842,
    rotation: 0,
  };
}

function graph(): PageGraph<PageNode> {
  return {
    pages: [
      page('cover', 0),
      page('front-1', 1),
      page('front-2', 2),
      page('body-1', 3),
      page('body-2', 4),
    ],
    pageLabelRanges: [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
    ],
  };
}

describe('header/footer editor draft compiler', () => {
  it('builds a canonical all-pages template with default printed numbering', () => {
    const template = compileHeaderFooterEditorDraft(
      createDefaultHeaderFooterEditorDraft(),
      {
        pageGraph: graph(),
        currentPageId: 'body-1',
        selectedPageIds: [],
      },
    );

    expect(template.rules[0]?.selector.include).toEqual({ mode: 'all' });
    expect(template.rules[0]?.footer?.right).toEqual({
      kind: 'text',
      template: 'Page {{physicalPage}} of {{pageCount}}',
    });
  });

  it('compiles current and selected UI targets to stable PageIds', () => {
    const current = createDefaultHeaderFooterEditorDraft();
    current.targetMode = 'current';
    expect(
      compileHeaderFooterEditorDraft(current, {
        pageGraph: graph(),
        currentPageId: 'body-1',
        selectedPageIds: [],
      }).rules[0]?.selector.include,
    ).toEqual({
      mode: 'pageIds',
      pageIds: ['body-1'],
    });

    const selected = createDefaultHeaderFooterEditorDraft();
    selected.targetMode = 'selected';
    expect(
      compileHeaderFooterEditorDraft(selected, {
        pageGraph: graph(),
        currentPageId: 'body-1',
        selectedPageIds: ['body-2', 'front-1'],
      }).rules[0]?.selector.include,
    ).toEqual({
      mode: 'pageIds',
      pageIds: ['front-1', 'body-2'],
    });
  });

  it('compiles current PageLabel section to its stable range-start PageId', () => {
    const draft = createDefaultHeaderFooterEditorDraft();
    draft.targetMode = 'current-page-label-section';

    const template = compileHeaderFooterEditorDraft(draft, {
      pageGraph: graph(),
      currentPageId: 'front-2',
      selectedPageIds: [],
    });

    expect(template.rules[0]?.selector.include).toEqual({
      mode: 'pageLabelRange',
      startPageId: 'front-1',
    });
  });

  it('preserves parity, exclusions, style, margins, and separators', () => {
    const draft = createDefaultHeaderFooterEditorDraft();
    draft.parity = 'even';
    draft.excludeFirstPhysicalPage = true;
    draft.excludeLastPhysicalPage = true;
    draft.header.left = '{{fileName}}';
    draft.headerSeparator = true;
    draft.footerSeparator = true;
    draft.fontFamily = 'Times';
    draft.fontSizePt = 12;
    draft.fontWeight = 'bold';
    draft.fontStyle = 'italic';
    draft.color = '#112233';
    draft.opacity = 0.75;
    draft.leftMarginPt = 40;
    draft.rightMarginPt = 50;
    draft.headerOffsetFromTopPt = 30;
    draft.footerOffsetFromBottomPt = 28;

    const template = compileHeaderFooterEditorDraft(draft, {
      pageGraph: graph(),
      currentPageId: 'body-1',
      selectedPageIds: [],
    });

    expect(template.rules[0]?.selector).toMatchObject({
      parity: 'even',
      excludeFirstPhysicalPage: true,
      excludeLastPhysicalPage: true,
    });
    expect(template.defaultTextStyle).toEqual({
      fontFamily: 'Times',
      fontSizePt: 12,
      fontWeight: 'bold',
      fontStyle: 'italic',
      color: '#112233',
      opacity: 0.75,
    });
    expect(template.layout).toEqual({
      leftMarginPt: 40,
      rightMarginPt: 50,
      headerOffsetFromTopPt: 30,
      footerOffsetFromBottomPt: 28,
    });
    expect(template.rules[0]?.header?.separator).toMatchObject({
      thicknessPt: 0.5,
      color: '#112233',
      opacity: 0.75,
    });
    expect(template.rules[0]?.footer?.separator).toMatchObject({
      thicknessPt: 0.5,
      color: '#112233',
      opacity: 0.75,
    });
  });

  it('fails instead of storing transient invalid selection state', () => {
    const selected = createDefaultHeaderFooterEditorDraft();
    selected.targetMode = 'selected';

    expect(() =>
      compileHeaderFooterEditorDraft(selected, {
        pageGraph: graph(),
        currentPageId: 'body-1',
        selectedPageIds: [],
      }),
    ).toThrow(/Select at least one page/);

    const empty = createDefaultHeaderFooterEditorDraft();
    empty.header = { left: '', center: '', right: '' };
    empty.footer = { left: '', center: '', right: '' };

    expect(() =>
      compileHeaderFooterEditorDraft(empty, {
        pageGraph: graph(),
        currentPageId: 'body-1',
        selectedPageIds: [],
      }),
    ).toThrow(/at least one header or footer slot/);
  });

  it('fails current-section targeting when no canonical PageLabel ranges exist', () => {
    const draft = createDefaultHeaderFooterEditorDraft();
    draft.targetMode = 'current-page-label-section';

    expect(() =>
      compileHeaderFooterEditorDraft(draft, {
        pageGraph: {
          pages: graph().pages,
        },
        currentPageId: 'body-1',
        selectedPageIds: [],
      }),
    ).toThrow(/editable canonical PageLabel section/);
  });
});
