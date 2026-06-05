import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterExportPreflightResult } from '@/core/writer-v2/export/writerExportPreflight';
import { WriterExportPreflightDialog } from './WriterExportPreflightDialog';

function resultWithClipIssue(): WriterExportPreflightResult {
  return {
    ok: true,
    hasErrors: false,
    hasWarnings: true,
    pageCount: 1,
    totalElementCount: 1,
    visibleElementCount: 1,
    hiddenElementCount: 0,
    textElementCount: 1,
    tableElementCount: 0,
    imageElementCount: 0,
    assetCount: 0,
    issues: [
      {
        code: 'RICH_CONTENT_MAY_CLIP',
        severity: 'warning',
        elementId: 'rich-1',
        pageIndex: 0,
        message: 'Writer rich box may clip.',
      },
    ],
    byPage: [
      {
        pageIndex: 0,
        visibleElementCount: 1,
        hiddenElementCount: 0,
      },
    ],
  };
}

describe('WriterExportPreflightDialog', () => {
  it('shows fit action for rich clipping warnings', () => {
    const onFix = vi.fn();

    render(
      <WriterExportPreflightDialog
        result={resultWithClipIssue()}
        exportLabel="Flattened PDF"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onFixRichContentClipping={onFix}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Fit clipped rich boxes (1)',
    });

    fireEvent.click(button);

    expect(onFix).toHaveBeenCalledTimes(1);
  });

  it('does not show fit action without callback', () => {
    render(
      <WriterExportPreflightDialog
        result={resultWithClipIssue()}
        exportLabel="Flattened PDF"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', {
      name: 'Fit clipped rich boxes (1)',
    })).toBeNull();
  });
});
