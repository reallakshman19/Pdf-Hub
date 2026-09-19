import { describe, expect, it } from 'vitest';

import { createPageGraph } from '@/core/pages/pageGraph';
import { withPageLabelRanges } from '@/core/pages/pageLabels';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import { resolveHeaderFooterTemplate } from './resolver';
import type { HeaderFooterTemplate } from './types';
import {
  PRINTED_NUMBERING_PRESETS,
  applyPrintedNumberingPresetToDraft,
  createPrintedNumberingRule,
  printedNumberingText,
} from './numberingPresets';
import { createDefaultHeaderFooterEditorDraft } from './editorDraft';

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

function acceptanceGraph(): PageGraph<PageNode> {
  const graph = createPageGraph(
    Array.from({ length: 10 }, (_, index) =>
      page(`p${index + 1}`, index),
    ),
  );

  return withPageLabelRanges(graph, [
    { startPageId: 'p1', prefix: 'Cover' },
    { startPageId: 'p2', style: 'roman-lower' },
    { startPageId: 'p6', style: 'decimal' },
    {
      startPageId: 'p9',
      style: 'decimal',
      prefix: 'A-',
    },
  ]);
}

function templateWithRules(
  rules: HeaderFooterTemplate['rules'],
): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    name: 'Acceptance numbering',
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
    rules,
  };
}

describe('printed numbering presets', () => {
  it('defines the five Phase 6F task presets', () => {
    expect(
      PRINTED_NUMBERING_PRESETS.map((preset) => preset.id),
    ).toEqual([
      'page-n',
      'page-n-of-m',
      'logical-label',
      'section-page-of-total',
      'appendix-label',
    ]);

    expect(printedNumberingText('page-n')).toBe(
      'Page {{physicalPage}}',
    );
    expect(printedNumberingText('page-n-of-m')).toBe(
      'Page {{physicalPage}} of {{pageCount}}',
    );
    expect(printedNumberingText('logical-label')).toBe(
      '{{pageLabel}}',
    );
    expect(printedNumberingText('section-page-of-total')).toBe(
      'Page {{sectionPage}} of {{sectionPageCount}}',
    );
    expect(
      printedNumberingText('appendix-label', {
        appendixTitle: 'Appendix B',
      }),
    ).toBe('Appendix B — {{pageLabel}}');
  });

  it('creates canonical rules from caller-owned stable selectors', () => {
    expect(
      createPrintedNumberingRule(
        'logical-label',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'p2',
          },
        },
        { ruleId: 'front-matter' },
      ),
    ).toEqual({
      id: 'front-matter',
      selector: {
        include: {
          mode: 'pageLabelRange',
          startPageId: 'p2',
        },
      },
      footer: {
        center: {
          kind: 'text',
          template: '{{pageLabel}}',
        },
      },
    });
  });

  it('applies a preset to the editor without changing its target or header', () => {
    const draft = createDefaultHeaderFooterEditorDraft();
    draft.targetMode = 'current-page-label-section';
    draft.header.left = '{{fileName}}';

    const next = applyPrintedNumberingPresetToDraft(
      draft,
      'section-page-of-total',
    );

    expect(next.targetMode).toBe('current-page-label-section');
    expect(next.header.left).toBe('{{fileName}}');
    expect(next.footer).toEqual({
      left: '',
      center: 'Page {{sectionPage}} of {{sectionPageCount}}',
      right: '',
    });
  });

  it('replaces a conflicting footer image because one slot has one canonical content value', () => {
    const draft = createDefaultHeaderFooterEditorDraft();
    draft.image = {
      resourceId: 'logo',
      fileName: 'logo.png',
      band: 'footer',
      slot: 'center',
      widthPt: 40,
    };

    const next = applyPrintedNumberingPresetToDraft(
      draft,
      'page-n',
    );

    expect(next.image).toBeNull();
    expect(next.footer.center).toBe('Page {{physicalPage}}');
  });

  it('resolves the cover/front/body/appendix acceptance pattern without changing PageLabels', () => {
    const graph = acceptanceGraph();
    const labelsBefore = graph.pages.map((pageNode) =>
      pageNode.logicalLabel,
    );
    const rangesBefore = graph.pageLabelRanges?.map((range) => ({
      ...range,
    }));

    const template = templateWithRules([
      createPrintedNumberingRule(
        'logical-label',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'p2',
          },
        },
        { ruleId: 'front-matter' },
      ),
      createPrintedNumberingRule(
        'section-page-of-total',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'p6',
          },
        },
        { ruleId: 'body' },
      ),
      createPrintedNumberingRule(
        'appendix-label',
        {
          include: {
            mode: 'pageLabelRange',
            startPageId: 'p9',
          },
        },
        {
          ruleId: 'appendix',
          appendixTitle: 'Appendix A',
        },
      ),
    ]);

    const result = resolveHeaderFooterTemplate(
      template,
      graph,
      {
        fileName: 'report.pdf',
        now: new Date('2026-09-19T00:00:00Z'),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pages[0]?.footer).toBeUndefined();
    expect(result.pages[1]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'i',
    });
    expect(result.pages[4]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'iv',
    });
    expect(result.pages[5]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'Page 1 of 3',
    });
    expect(result.pages[7]?.footer?.center).toMatchObject({
      kind: 'text',
      text: 'Page 3 of 3',
    });
    expect(result.pages[8]?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'Appendix A — A-1',
    });
    expect(result.pages[9]?.footer?.right).toMatchObject({
      kind: 'text',
      text: 'Appendix A — A-2',
    });

    expect(
      graph.pages.map((pageNode) => pageNode.logicalLabel),
    ).toEqual(labelsBefore);
    expect(graph.pageLabelRanges).toEqual(rangesBefore);
  });
});
