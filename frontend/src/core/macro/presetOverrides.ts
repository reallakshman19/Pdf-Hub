import type {
  MacroRecipe,
  MacroStep,
  PageSelector,
} from './types';

export type SelectorMode = 'selected' | 'current' | 'all' | 'range';
export type BlankPlacement = 'before' | 'after';
export type BlankSizeMode = 'match-current' | 'a4' | 'letter';

export interface RecipeOverrides {
  selectorMode: SelectorMode;
  rangeFrom: number;
  rangeTo: number;
  rotateDegrees: 90 | 180 | 270;
  outputName: string;
  headerFooterText: string;
  headerFooterAlign: 'left' | 'center' | 'right';
  headerFooterMarginX: number;
  headerFooterMarginY: number;
  headerFooterFontSize: number;
  headerFooterColor: string;
  headerFooterOpacity: number;
  headerFooterPageToken: boolean;
  headerFooterFileToken: boolean;
  headerFooterDateToken: boolean;
  blankPlacement: BlankPlacement;
  blankSize: BlankSizeMode;
  blankCount: number;
}

export function createDefaultOverrides(
  recipe: MacroRecipe | undefined,
  pageCount: number,
): RecipeOverrides {
  const normalizedPageCount = Math.max(1, pageCount);

  if (!recipe) {
    return {
      selectorMode: 'selected',
      rangeFrom: 1,
      rangeTo: normalizedPageCount,
      rotateDegrees: 90,
      outputName: 'macro-output.pdf',
      headerFooterText: 'Page {page} of {pages}',
      headerFooterAlign: 'center',
      headerFooterMarginX: 24,
      headerFooterMarginY: 20,
      headerFooterFontSize: 10,
      headerFooterColor: '#475569',
      headerFooterOpacity: 0.9,
      headerFooterPageToken: true,
      headerFooterFileToken: false,
      headerFooterDateToken: false,
      blankPlacement: 'after',
      blankSize: 'match-current',
      blankCount: 1,
    };
  }

  const selectLikeStep = recipe.steps.find((step) => hasSelector(step));
  const selector = selectLikeStep
    ? selectorFromStep(selectLikeStep)
    : { mode: 'selected' as const };

  const rotateStep = recipe.steps.find((step) => step.op === 'rotate_pages');
  const outputStep = recipe.steps.find(
    (step) => step.op === 'extract_pages' || step.op === 'split_pages',
  );
  const headerFooterStep = recipe.steps.find(
    (step) => step.op === 'header_footer_text',
  );
  const blankInsertStep = recipe.steps.find(
    (step) => step.op === 'insert_blank_page',
  );

  return {
    selectorMode:
      selector.mode === 'range'
      || selector.mode === 'current'
      || selector.mode === 'all'
        ? selector.mode
        : 'selected',
    rangeFrom: selector.mode === 'range' ? selector.from : 1,
    rangeTo: selector.mode === 'range' ? selector.to : normalizedPageCount,
    rotateDegrees:
      rotateStep?.op === 'rotate_pages'
        ? rotateStep.degrees
        : 90,
    outputName:
      outputStep?.op === 'extract_pages' || outputStep?.op === 'split_pages'
        ? outputStep.outputName ?? `${recipe.id}.pdf`
        : `${recipe.id}.pdf`,
    headerFooterText:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.text
        : 'Page {page} of {pages}',
    headerFooterAlign:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.align
        : 'center',
    headerFooterMarginX:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.marginX
        : 24,
    headerFooterMarginY:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.marginY
        : 20,
    headerFooterFontSize:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.fontSize
        : 10,
    headerFooterColor:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.color ?? '#475569'
        : '#475569',
    headerFooterOpacity:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.opacity ?? 0.9
        : 0.9,
    headerFooterPageToken:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.pageNumberToken ?? true
        : true,
    headerFooterFileToken:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.fileNameToken ?? false
        : false,
    headerFooterDateToken:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.dateToken ?? false
        : false,
    blankPlacement:
      blankInsertStep?.op === 'insert_blank_page'
      && blankInsertStep.position.mode === 'before'
        ? 'before'
        : 'after',
    blankSize:
      blankInsertStep?.op === 'insert_blank_page'
      && typeof blankInsertStep.size === 'string'
        ? blankInsertStep.size
        : 'match-current',
    blankCount:
      blankInsertStep?.op === 'insert_blank_page'
        ? blankInsertStep.count ?? 1
        : 1,
  };
}

export function applyOverridesToRecipe(
  recipe: MacroRecipe,
  overrides: RecipeOverrides,
  currentPage: number,
  pageCount: number,
): MacroRecipe {
  const selector = toPageSelector(overrides, pageCount);

  const nextSteps = recipe.steps.map((step) => {
    switch (step.op) {
      case 'select_pages':
        return { ...step, selector };

      case 'extract_pages':
      case 'split_pages':
        return {
          ...step,
          selector,
          outputName: cleanOutputName(overrides.outputName, step.outputName),
        };

      case 'duplicate_pages':
      case 'rotate_pages':
      case 'remove_pages':
        return {
          ...step,
          selector,
          ...(step.op === 'rotate_pages'
            ? { degrees: overrides.rotateDegrees }
            : {}),
        };

      case 'header_footer_text':
        return {
          ...step,
          selector,
          text: overrides.headerFooterText,
          align: overrides.headerFooterAlign,
          marginX: overrides.headerFooterMarginX,
          marginY: overrides.headerFooterMarginY,
          fontSize: overrides.headerFooterFontSize,
          color: overrides.headerFooterColor,
          opacity: clamp(overrides.headerFooterOpacity, 0, 1),
          pageNumberToken: overrides.headerFooterPageToken,
          fileNameToken: overrides.headerFooterFileToken,
          dateToken: overrides.headerFooterDateToken,
        };

      case 'insert_blank_page':
        return {
          ...step,
          position: {
            mode: overrides.blankPlacement,
            page: currentPage,
          },
          size: overrides.blankSize,
          count: Math.max(1, overrides.blankCount),
        };

      default:
        return step;
    }
  });

  return {
    ...recipe,
    steps: nextSteps,
  };
}

function cleanOutputName(
  candidate: string,
  fallback: string | undefined,
): string | undefined {
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function hasSelector(step: MacroStep): boolean {
  return (
    step.op === 'select_pages'
    || step.op === 'extract_pages'
    || step.op === 'split_pages'
    || step.op === 'duplicate_pages'
    || step.op === 'rotate_pages'
    || step.op === 'remove_pages'
    || step.op === 'header_footer_text'
  );
}

function selectorFromStep(step: MacroStep): PageSelector {
  switch (step.op) {
    case 'select_pages':
    case 'extract_pages':
    case 'split_pages':
    case 'duplicate_pages':
    case 'rotate_pages':
    case 'remove_pages':
    case 'header_footer_text':
      return step.selector;
    default:
      return { mode: 'selected' };
  }
}

function toPageSelector(
  overrides: RecipeOverrides,
  pageCount: number,
): PageSelector {
  if (overrides.selectorMode === 'all') {
    return { mode: 'all' };
  }
  if (overrides.selectorMode === 'current') {
    return { mode: 'current' };
  }
  if (overrides.selectorMode === 'range') {
    const maxPage = Math.max(1, pageCount);
    return {
      mode: 'range',
      from: clamp(overrides.rangeFrom, 1, maxPage),
      to: clamp(overrides.rangeTo, 1, maxPage),
    };
  }
  return { mode: 'selected' };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
