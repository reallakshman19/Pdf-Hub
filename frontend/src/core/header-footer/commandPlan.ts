import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import type {
  HeaderFooterResolutionContext,
  ResolvedHeaderFooterPage,
} from './resolutionTypes';
import { resolveHeaderFooterTemplate } from './resolver';

export type HeaderFooterTemplateCommandPlan =
  | {
      ok: true;
      pages: ResolvedHeaderFooterPage[];
      requiredBinaryResourceIds: string[];
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

/**
 * Pure preflight boundary for APPLY_HEADER_FOOTER_TEMPLATE.
 *
 * This resolves stable page selectors/tokens and enumerates every out-of-band
 * binary resource required by the eventual PDF writer. It does not read or
 * mutate PDF bytes.
 */
export function planHeaderFooterTemplateCommand(
  template: HeaderFooterTemplate,
  pageGraph: PageGraph<PageNode>,
  context: HeaderFooterResolutionContext,
): HeaderFooterTemplateCommandPlan {
  const resolution = resolveHeaderFooterTemplate(
    template,
    pageGraph,
    context,
  );

  if (!resolution.ok) {
    return resolution;
  }

  const pages = resolution.pages.filter(
    (page) => Boolean(page.header || page.footer),
  );
  const warnings = [...resolution.warnings];

  if (pages.length === 0) {
    warnings.push('Header/footer template matches no pages.');
  }

  return {
    ok: true,
    pages,
    requiredBinaryResourceIds: collectRequiredBinaryResourceIds(pages),
    warnings,
  };
}

function collectRequiredBinaryResourceIds(
  pages: readonly ResolvedHeaderFooterPage[],
): string[] {
  const ids = new Set<string>();

  for (const page of pages) {
    collectBandImages(page.header, ids);
    collectBandImages(page.footer, ids);
  }

  return [...ids].sort();
}

function collectBandImages(
  band: ResolvedHeaderFooterPage['header'],
  ids: Set<string>,
): void {
  if (!band) return;

  for (const content of [band.left, band.center, band.right]) {
    if (content?.kind === 'image') {
      ids.add(content.binaryResourceId);
    }
  }
}
