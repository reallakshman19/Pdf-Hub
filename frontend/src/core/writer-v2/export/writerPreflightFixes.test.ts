import { describe, expect, it } from 'vitest';
import type { WriterExportPreflightResult } from './writerExportPreflight';
import {
  canFixRichContentClipIssues,
  richContentClipIssueIds,
} from './writerPreflightFixes';

function resultWithIssues(
  issues: WriterExportPreflightResult['issues'],
): WriterExportPreflightResult {
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    hasErrors: issues.some((issue) => issue.severity === 'error'),
    hasWarnings: issues.some((issue) => issue.severity === 'warning'),
    pageCount: 1,
    totalElementCount: 1,
    visibleElementCount: 1,
    hiddenElementCount: 0,
    textElementCount: 1,
    tableElementCount: 0,
    imageElementCount: 0,
    assetCount: 0,
    issues,
    byPage: [
      {
        pageIndex: 0,
        visibleElementCount: 1,
        hiddenElementCount: 0,
      },
    ],
  };
}

describe('writerPreflightFixes', () => {
  it('extracts unique rich clip issue ids', () => {
    const ids = richContentClipIssueIds([
      {
        code: 'RICH_CONTENT_MAY_CLIP',
        severity: 'warning',
        message: 'clip',
        elementId: 'a',
      },
      {
        code: 'RICH_CONTENT_MAY_CLIP',
        severity: 'warning',
        message: 'clip',
        elementId: 'a',
      },
      {
        code: 'OBJECT_LOW_OPACITY',
        severity: 'warning',
        message: 'opacity',
        elementId: 'b',
      },
    ]);

    expect(ids).toEqual(['a']);
  });

  it('reports fix availability only for rich clip issues', () => {
    expect(
      canFixRichContentClipIssues(
        resultWithIssues([
          {
            code: 'RICH_CONTENT_MAY_CLIP',
            severity: 'warning',
            message: 'clip',
            elementId: 'a',
          },
        ]),
      ),
    ).toBe(true);

    expect(
      canFixRichContentClipIssues(
        resultWithIssues([
          {
            code: 'OBJECT_LOW_OPACITY',
            severity: 'warning',
            message: 'opacity',
            elementId: 'b',
          },
        ]),
      ),
    ).toBe(false);
  });
});
