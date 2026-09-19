import { describe, expect, it } from 'vitest';

import { createPageGraph } from '@/core/pages/pageGraph';
import type { PageNode } from '@/core/pages/types';
import { resolveHeaderFooterTemplate } from '@/core/header-footer/resolver';
import {
  compileLegacyHeaderFooterTextStep,
  translateLegacyHeaderFooterText,
  type LegacyHeaderFooterTextStep,
} from './headerFooterTextCompat';

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

function graph() {
  return createPageGraph([
    page('p1', 0),
    page('p2', 1),
    page('p3', 2),
  ]);
}

function baseStep(
  patch: Partial<LegacyHeaderFooterTextStep> = {},
): LegacyHeaderFooterTextStep {
  return {
    op: 'header_footer_text',
    selector: { mode: 'all' },
    zone: 'footer',
    text: 'Page {page} of {pages}',
    align: 'center',
    marginX: 24,
    marginY: 20,
    fontSize: 10,
    ...patch,
  };
}

describe('legacy header/footer macro compatibility compiler', () => {
  it('normalizes legacy page token forms to canonical physical-page tokens', () => {
    expect(
      translateLegacyHeaderFooterText(
        baseStep({
          text: 'Page {{page}} / {page} of {{total_pages}} / {{pages}} / {pages}',
        }),
      ).text,
    ).toBe(
      'Page {{physicalPage}} / {{physicalPage}} of {{pageCount}} / {{pageCount}} / {{pageCount}}',
    );
  });

  it('honors legacy file/date opt-in flags', () => {
    const disabled = translateLegacyHeaderFooterText(
      baseStep({
        text: '{file} {{file}} {date} {{date}}',
        fileNameToken: false,
        dateToken: false,
      }),
    );

    expect(disabled.text).toBe(
      '{file} {{var:__legacy_hf_literal_0}} {date} {{var:__legacy_hf_literal_1}}',
    );
    expect(disabled.variables).toEqual({
      __legacy_hf_literal_0: '{{file}}',
      __legacy_hf_literal_1: '{{date}}',
    });

    const enabled = translateLegacyHeaderFooterText(
      baseStep({
        text: '{file} {{file_name}} {{file}} {date} {{date}}',
        fileNameToken: true,
        dateToken: true,
      }),
    );

    expect(enabled).toEqual({
      text: '{{fileName}} {{fileName}} {{fileName}} {{date}} {{date}}',
      variables: {},
    });
  });

  it('escapes unknown/canonical-looking double-brace literals instead of reinterpreting them', () => {
    const translated = translateLegacyHeaderFooterText(
      baseStep({
        text: 'Keep {{physicalPage}} and {{unknown_token}} literal',
        pageNumberToken: false,
      }),
    );

    expect(translated.text).toBe(
      'Keep {{var:__legacy_hf_literal_0}} and {{var:__legacy_hf_literal_1}} literal',
    );
    expect(translated.variables).toEqual({
      __legacy_hf_literal_0: '{{physicalPage}}',
      __legacy_hf_literal_1: '{{unknown_token}}',
    });
  });

  it('resolves through the canonical template engine with legacy locale date text', () => {
    const now = new Date('2026-09-19T03:00:00.000Z');
    const compilation = compileLegacyHeaderFooterTextStep(
      baseStep({
        text: 'Page {page} of {pages} | {file} | {date}',
        fileNameToken: true,
        dateToken: true,
      }),
      ['p1', 'p3'],
      now,
    );

    const resolved = resolveHeaderFooterTemplate(
      compilation.template,
      graph(),
      {
        fileName: 'report.pdf',
        now,
        dateText: compilation.dateText,
        variables: compilation.variables,
      },
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.pages).toHaveLength(2);
    expect(resolved.pages[0]?.footer?.center).toMatchObject({
      kind: 'text',
      text: `Page 1 of 3 | report.pdf | ${now.toLocaleDateString()}`,
    });
    expect(resolved.pages[1]?.footer?.center).toMatchObject({
      kind: 'text',
      text: `Page 3 of 3 | report.pdf | ${now.toLocaleDateString()}`,
    });
  });
});
