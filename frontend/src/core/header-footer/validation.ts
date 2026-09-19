import type { PageGraph, PageNode } from '@/core/pages/types';
import {
  HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION,
  type HeaderFooterPageSelector,
  type HeaderFooterTemplate,
} from './types';
import {
  validateHeaderFooterBand,
  validateHeaderFooterLayout,
  validateHeaderFooterTextStyle,
} from './contentValidation';

export interface HeaderFooterTemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateHeaderFooterTemplate(
  template: HeaderFooterTemplate,
  pageGraph: PageGraph<PageNode>,
): HeaderFooterTemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (template.schemaVersion !== HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION}.`,
    );
  }

  validateHeaderFooterLayout(template.layout, 'layout', errors);
  validateHeaderFooterTextStyle(
    template.defaultTextStyle,
    'defaultTextStyle',
    errors,
  );

  if (!Array.isArray(template.rules) || template.rules.length === 0) {
    errors.push('rules must contain at least one rule.');
  } else {
    const seenRuleIds = new Set<string>();

    template.rules.forEach((rule, index) => {
      const path = `rules[${index}]`;
      const id = rule.id?.trim();

      if (!id) {
        errors.push(`${path}.id is required.`);
      } else if (seenRuleIds.has(id)) {
        errors.push(`${path}.id duplicates rule id "${id}".`);
      } else {
        seenRuleIds.add(id);
      }

      validateSelector(
        rule.selector,
        pageGraph,
        `${path}.selector`,
        errors,
        warnings,
      );

      if (!rule.header && !rule.footer) {
        errors.push(`${path} must define header or footer content.`);
      }

      if (rule.header) {
        validateHeaderFooterBand(rule.header, `${path}.header`, errors);
      }
      if (rule.footer) {
        validateHeaderFooterBand(rule.footer, `${path}.footer`, errors);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSelector(
  selector: HeaderFooterPageSelector,
  pageGraph: PageGraph<PageNode>,
  path: string,
  errors: string[],
  warnings: string[],
): void {
  if (!selector || typeof selector !== 'object' || !selector.include) {
    errors.push(`${path}.include is required.`);
    return;
  }

  const pageIndexById = new Map(
    pageGraph.pages.map((page, index) => [page.pageId, index] as const),
  );

  switch (selector.include.mode) {
    case 'all':
      break;

    case 'pageIds': {
      const ids = selector.include.pageIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        errors.push(`${path}.include.pageIds must contain at least one PageId.`);
        break;
      }
      if (new Set(ids).size !== ids.length) {
        errors.push(`${path}.include.pageIds must not contain duplicates.`);
      }
      ids.forEach((pageId) => {
        if (!pageIndexById.has(pageId)) {
          errors.push(
            `${path}.include.pageIds contains unknown PageId "${pageId}".`,
          );
        }
      });
      break;
    }

    case 'range':
      validateKnownPageId(
        selector.include.startPageId,
        `${path}.include.startPageId`,
        pageIndexById,
        errors,
      );
      validateKnownPageId(
        selector.include.endPageId,
        `${path}.include.endPageId`,
        pageIndexById,
        errors,
      );
      break;

    case 'pageLabelRange': {
      const exists = pageGraph.pageLabelRanges?.some(
        (range) => range.startPageId === selector.include.startPageId,
      );
      if (!exists) {
        errors.push(
          `${path}.include.startPageId must identify a canonical PageLabel range start.`,
        );
      }
      break;
    }

    default:
      assertNever(selector.include);
  }

  if (
    selector.parity !== undefined
    && selector.parity !== 'all'
    && selector.parity !== 'odd'
    && selector.parity !== 'even'
  ) {
    errors.push(`${path}.parity must be all, odd, or even.`);
  }

  if (
    selector.excludeFirstPhysicalPage
    && selector.excludeLastPhysicalPage
    && pageGraph.pages.length <= 2
  ) {
    warnings.push(
      `${path} excludes both first and last pages in a document with ${pageGraph.pages.length} page(s); it may match no pages.`,
    );
  }
}

function validateKnownPageId(
  pageId: string,
  path: string,
  pageIndexById: ReadonlyMap<string, number>,
  errors: string[],
): void {
  if (!pageIndexById.has(pageId)) {
    errors.push(`${path} does not exist: "${pageId}".`);
  }
}

function assertNever(value: never): never {
  throw new Error(
    `Unsupported header/footer selector value: ${JSON.stringify(value)}`,
  );
}
