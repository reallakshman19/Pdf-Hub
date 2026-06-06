import type { OcrDiagnostic } from './types';
import type { OcrProfileId } from './ocrProfiles';
import { getOcrProfile, type OcrProfile } from './ocrProfiles';
import {
  classifyOcrPage,
  isLikelyScannedPage,
  shouldPreferEmbeddedText,
  type OcrPageClassificationInput,
  type OcrPageClassificationResult,
} from './ocrPageClassifier';

export type OcrPreflightPageAction =
  | 'skip'
  | 'ocr'
  | 'ocr-image-regions'
  | 'ocr-table'
  | 'ocr-engineering'
  | 'force-ocr';

export interface OcrPreflightPageInput extends OcrPageClassificationInput {
  /**
   * Set when user explicitly selected this page for OCR.
   */
  selected?: boolean;
}

export interface OcrPreflightInput {
  documentFingerprint: string;
  pages: OcrPreflightPageInput[];

  /**
   * Optional user-requested profile. If omitted, preflight chooses per page.
   */
  requestedProfileId?: OcrProfileId;

  /**
   * If true, OCR all pages even if embedded PDF text exists.
   */
  forceOcr?: boolean;

  /**
   * If set, only these pages are eligible.
   */
  selectedPageIndexes?: number[];
}

export interface OcrPreflightPageDecision {
  pageIndex: number;
  classification: OcrPageClassificationResult;
  action: OcrPreflightPageAction;
  profile: OcrProfile;
  shouldQueue: boolean;
  reasons: string[];
  diagnostics: OcrDiagnostic[];
}

export interface OcrPreflightResult {
  documentFingerprint: string;
  pageDecisions: OcrPreflightPageDecision[];
  queuedPageIndexes: number[];
  skippedPageIndexes: number[];
  diagnostics: OcrDiagnostic[];
}

export function runOcrPreflight(
  input: OcrPreflightInput,
): OcrPreflightResult {
  const selected = new Set(input.selectedPageIndexes ?? []);
  const useSelectionFilter = selected.size > 0;

  const pageDecisions = input.pages.map((page) => {
    const outsideSelection = useSelectionFilter && !selected.has(page.pageIndex);

    if (outsideSelection) {
      const classification = classifyOcrPage(page);
      const profile = getOcrProfile(input.requestedProfileId ?? 'clean-scan');

      return {
        pageIndex: page.pageIndex,
        classification,
        action: 'skip' as const,
        profile,
        shouldQueue: false,
        reasons: [
          'Page is outside selected OCR page range.',
          ...classification.reasons,
        ],
        diagnostics: [
          {
            level: 'info' as const,
            code: 'PAGE_SKIPPED_BORN_DIGITAL' as const,
            pageIndex: page.pageIndex,
            message: 'Page skipped because it was not selected for OCR.',
          },
        ],
      };
    }

    return decideOcrForPage({
      page,
      requestedProfileId: input.requestedProfileId,
      forceOcr: input.forceOcr ?? false,
    });
  });

  const diagnostics = pageDecisions.flatMap((decision) => decision.diagnostics);

  return {
    documentFingerprint: input.documentFingerprint,
    pageDecisions,
    queuedPageIndexes: pageDecisions
      .filter((decision) => decision.shouldQueue)
      .map((decision) => decision.pageIndex),
    skippedPageIndexes: pageDecisions
      .filter((decision) => !decision.shouldQueue)
      .map((decision) => decision.pageIndex),
    diagnostics,
  };
}

export function decideOcrForPage(input: {
  page: OcrPreflightPageInput;
  requestedProfileId?: OcrProfileId;
  forceOcr: boolean;
}): OcrPreflightPageDecision {
  const classification = classifyOcrPage(input.page);
  const diagnostics: OcrDiagnostic[] = [];

  if (input.forceOcr || input.requestedProfileId === 'force-ocr') {
    const profile = getOcrProfile('force-ocr');

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'force-ocr',
      profile,
      shouldQueue: true,
      reasons: [
        'Force OCR is enabled.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  if (
    classification.pageType === 'bornDigital'
    && shouldPreferEmbeddedText(classification.pageType)
  ) {
    const profile = getOcrProfile(input.requestedProfileId ?? 'clean-scan');

    diagnostics.push({
      level: 'info',
      code: 'PAGE_SKIPPED_BORN_DIGITAL',
      pageIndex: input.page.pageIndex,
      message: 'Page skipped because embedded PDF text is preferred.',
    });

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'skip',
      profile,
      shouldQueue: false,
      reasons: [
        'Embedded text is sufficient; OCR skipped by default.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  if (classification.pageType === 'mixed') {
    const profile = getOcrProfile(input.requestedProfileId ?? 'clean-scan');

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'ocr-image-regions',
      profile,
      shouldQueue: true,
      reasons: [
        'Mixed page: preserve embedded text and OCR image regions.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  if (classification.pageType === 'tableHeavy') {
    const profile = getOcrProfile(input.requestedProfileId ?? 'table-heavy');

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'ocr-table',
      profile,
      shouldQueue: true,
      reasons: [
        'Table-heavy page: table OCR profile selected.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  if (classification.pageType === 'engineeringDrawing') {
    const profile = getOcrProfile(input.requestedProfileId ?? 'engineering-drawing');

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'ocr-engineering',
      profile,
      shouldQueue: true,
      reasons: [
        'Engineering drawing profile selected.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  if (isLikelyScannedPage(classification.pageType)) {
    const profile = getOcrProfile(input.requestedProfileId ?? 'clean-scan');

    return {
      pageIndex: input.page.pageIndex,
      classification,
      action: 'ocr',
      profile,
      shouldQueue: true,
      reasons: [
        'Page appears to require OCR.',
        ...classification.reasons,
      ],
      diagnostics,
    };
  }

  const fallbackProfile = getOcrProfile(input.requestedProfileId ?? 'clean-scan');

  return {
    pageIndex: input.page.pageIndex,
    classification,
    action: 'ocr',
    profile: fallbackProfile,
    shouldQueue: true,
    reasons: [
      'Unknown page type; OCR queued conservatively.',
      ...classification.reasons,
    ],
    diagnostics,
  };
}
