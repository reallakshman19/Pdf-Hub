import type { PageNode } from '@/core/pages/types';
import type { HeaderFooterResolutionContext } from './resolutionTypes';

export interface HeaderFooterTokenValues {
  physicalPage: number;
  pageLabel: string;
  pageCount: number;
  sectionPage: number;
  sectionPageCount: number;
  page: PageNode;
}

const TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export function resolveHeaderFooterText(
  template: string,
  values: HeaderFooterTokenValues,
  context: HeaderFooterResolutionContext,
  warnings: Set<string>,
): string {
  const dateText = context.dateText ?? formatUtcDate(context.now);
  const timeText = context.timeText ?? formatUtcTime(context.now);

  return template.replace(TOKEN_PATTERN, (_match, rawToken: string) => {
    const token = rawToken.trim();

    switch (token) {
      case 'physicalPage':
        return String(values.physicalPage);
      case 'pageLabel':
        return values.pageLabel;
      case 'pageCount':
        return String(values.pageCount);
      case 'sectionPage':
        return String(values.sectionPage);
      case 'sectionPageCount':
        return String(values.sectionPageCount);
      case 'fileName':
        return context.fileName;
      case 'title':
        return context.title ?? '';
      case 'author':
        return context.author ?? '';
      case 'date':
        return dateText;
      case 'time':
        return timeText;
      default:
        return resolveDynamicToken(token, context, warnings);
    }
  });
}

function resolveDynamicToken(
  token: string,
  context: HeaderFooterResolutionContext,
  warnings: Set<string>,
): string {
  if (token.startsWith('metadata:')) {
    const key = token.slice('metadata:'.length).trim();
    const value = context.metadata?.[key];
    if (value === undefined) {
      warnings.add(`Header/footer metadata token has no value: ${key}`);
      return '';
    }
    return value;
  }

  if (token.startsWith('var:')) {
    const key = token.slice('var:'.length).trim();
    const value = context.variables?.[key];
    if (value === undefined) {
      warnings.add(`Header/footer variable token has no value: ${key}`);
      return '';
    }
    return value;
  }

  warnings.add(`Header/footer token was not resolved: ${token}`);
  return '';
}

function formatUtcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function formatUtcTime(now: Date): string {
  return `${now.toISOString().slice(11, 19)}Z`;
}
