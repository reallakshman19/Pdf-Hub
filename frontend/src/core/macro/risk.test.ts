import { describe, expect, it } from 'vitest';

import type { MacroRecipe } from './types';
import { analyzeMacroWorkflowRisk } from './risk';

describe('analyzeMacroWorkflowRisk', () => {
  it('treats additive/content workflows as safe', () => {
    const recipe: MacroRecipe = {
      id: 'safe',
      name: 'Safe',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'all' },
          zone: 'footer',
          text: 'Page {{page}}',
          align: 'center',
          marginX: 24,
          marginY: 24,
          fontSize: 9,
        },
      ],
    };

    expect(analyzeMacroWorkflowRisk(recipe)).toEqual({
      risk: 'safe',
      destructiveOps: [],
    });
  });

  it('requires preview for destructive page-structure operations', () => {
    const recipe: MacroRecipe = {
      id: 'destructive',
      name: 'Destructive',
      steps: [
        {
          op: 'remove_pages',
          selector: { mode: 'selected' },
        },
        {
          op: 'replace_page',
          targetPage: 1,
          donorFileId: 'donor',
          donorPage: 1,
        },
      ],
    };

    expect(analyzeMacroWorkflowRisk(recipe)).toEqual({
      risk: 'preview-required',
      destructiveOps: ['remove_pages', 'replace_page'],
    });
  });

  it('detects destructive operations inside conditional branches', () => {
    const recipe: MacroRecipe = {
      id: 'nested',
      name: 'Nested',
      steps: [
        {
          op: 'conditional',
          condition: {
            type: 'page_count_gt',
            value: 1,
          },
          then: [
            {
              op: 'split_pages',
              selector: { mode: 'selected' },
              outputName: 'split.pdf',
            },
          ],
        },
      ],
    };

    expect(analyzeMacroWorkflowRisk(recipe)).toEqual({
      risk: 'preview-required',
      destructiveOps: ['split_pages'],
    });
  });
});
