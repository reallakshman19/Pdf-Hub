import type { PageGraph, PageNode } from '@/core/pages/types';
import type {
  HeaderFooterBandTemplate,
  HeaderFooterContent,
  HeaderFooterTemplate,
  HeaderFooterTextStyle,
} from './types';
import type {
  HeaderFooterResolutionContext,
  HeaderFooterResolutionResult,
  ResolvedHeaderFooterBand,
  ResolvedHeaderFooterContent,
  ResolvedHeaderFooterPage,
} from './resolutionTypes';
import {
  matchesHeaderFooterSelector,
  sectionForPage,
} from './selectorResolver';
import { resolveHeaderFooterText } from './tokenResolver';
import { validateHeaderFooterTemplate } from './validation';

export function resolveHeaderFooterTemplate(
  template: HeaderFooterTemplate,
  pageGraph: PageGraph<PageNode>,
  context: HeaderFooterResolutionContext,
): HeaderFooterResolutionResult {
  const validation = validateHeaderFooterTemplate(template, pageGraph);
  const warnings = new Set(validation.warnings);

  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: [...warnings],
    };
  }

  if (!(context.now instanceof Date) || !Number.isFinite(context.now.getTime())) {
    return {
      ok: false,
      errors: ['Header/footer resolution context.now must be a valid Date.'],
      warnings: [...warnings],
    };
  }

  const pages = pageGraph.pages.map((page, pageIndex) =>
    resolvePage(template, pageGraph, page, pageIndex, context, warnings),
  );

  return {
    ok: true,
    pages,
    warnings: [...warnings],
  };
}

function resolvePage(
  template: HeaderFooterTemplate,
  pageGraph: PageGraph<PageNode>,
  page: PageNode,
  pageIndex: number,
  context: HeaderFooterResolutionContext,
  warnings: Set<string>,
): ResolvedHeaderFooterPage {
  const physicalPageNumber = pageIndex + 1;
  const section = sectionForPage(pageGraph, pageIndex);
  const sectionPageNumber = pageIndex - section.startIndex + 1;
  const sectionPageCount = Math.max(0, section.endExclusive - section.startIndex);
  const logicalPageLabel = page.logicalLabel ?? String(physicalPageNumber);

  let header: ResolvedHeaderFooterBand | undefined;
  let footer: ResolvedHeaderFooterBand | undefined;

  for (const rule of template.rules) {
    if (!matchesHeaderFooterSelector(rule.selector, pageGraph, pageIndex)) {
      continue;
    }

    const tokenValues = {
      physicalPage: physicalPageNumber,
      pageLabel: logicalPageLabel,
      pageCount: pageGraph.pages.length,
      sectionPage: sectionPageNumber,
      sectionPageCount,
      page,
    };

    if (rule.header) {
      header = mergeBand(
        header,
        rule.header,
        template.defaultTextStyle,
        tokenValues,
        context,
        warnings,
      );
    }

    if (rule.footer) {
      footer = mergeBand(
        footer,
        rule.footer,
        template.defaultTextStyle,
        tokenValues,
        context,
        warnings,
      );
    }
  }

  return {
    pageId: page.pageId,
    physicalPageNumber,
    logicalPageLabel,
    sectionPageNumber,
    sectionPageCount,
    layout: { ...template.layout },
    ...(header ? { header } : {}),
    ...(footer ? { footer } : {}),
  };
}

function mergeBand(
  current: ResolvedHeaderFooterBand | undefined,
  source: HeaderFooterBandTemplate,
  defaultTextStyle: HeaderFooterTextStyle,
  tokenValues: Parameters<typeof resolveHeaderFooterText>[1],
  context: HeaderFooterResolutionContext,
  warnings: Set<string>,
): ResolvedHeaderFooterBand {
  const next: ResolvedHeaderFooterBand = current ? { ...current } : {};

  if (source.left) {
    next.left = resolveContent(
      source.left,
      defaultTextStyle,
      tokenValues,
      context,
      warnings,
    );
  }
  if (source.center) {
    next.center = resolveContent(
      source.center,
      defaultTextStyle,
      tokenValues,
      context,
      warnings,
    );
  }
  if (source.right) {
    next.right = resolveContent(
      source.right,
      defaultTextStyle,
      tokenValues,
      context,
      warnings,
    );
  }
  if (source.separator) {
    next.separator = {
      thicknessPt: source.separator.thicknessPt,
      color: source.separator.color,
      opacity: source.separator.opacity ?? 1,
      insetLeftPt: source.separator.insetLeftPt ?? 0,
      insetRightPt: source.separator.insetRightPt ?? 0,
    };
  }

  return next;
}

function resolveContent(
  content: HeaderFooterContent,
  defaultTextStyle: HeaderFooterTextStyle,
  tokenValues: Parameters<typeof resolveHeaderFooterText>[1],
  context: HeaderFooterResolutionContext,
  warnings: Set<string>,
): ResolvedHeaderFooterContent {
  if (content.kind === 'text') {
    return {
      kind: 'text',
      text: resolveHeaderFooterText(
        content.template,
        tokenValues,
        context,
        warnings,
      ),
      style: {
        ...defaultTextStyle,
        ...(content.style ?? {}),
      },
    };
  }

  if (content.kind === 'image') {
    return {
      kind: 'image',
      binaryResourceId: content.binaryResourceId,
      widthPt: content.widthPt,
      ...(content.heightPt !== undefined ? { heightPt: content.heightPt } : {}),
      opacity: content.opacity ?? 1,
      fit: content.fit ?? 'contain',
      ...(content.altText ? { altText: content.altText } : {}),
    };
  }

  return assertNever(content);
}

function assertNever(value: never): never {
  throw new Error(
    `Unsupported header/footer content during resolution: ${JSON.stringify(value)}`,
  );
}
