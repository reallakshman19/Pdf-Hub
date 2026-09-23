import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { createOcrDemoResult } from '@/core/ocr/fixtures/ocrDemoFixtures';
import type { OcrResumeTokenV1 } from '@/core/ocr/ocrResumeState';
import {
  useOcrRunWorkflow,
  type UseOcrRunWorkflowInput,
} from '../workflow/useOcrRunWorkflow';

function WorkflowProbe(props: UseOcrRunWorkflowInput) {
  const workflow = useOcrRunWorkflow(props);

  return (
    <div>
      <div data-testid="workflow-state">{workflow.state}</div>
      <div data-testid="workflow-fingerprint">{workflow.effectiveDocumentFingerprint}</div>
      <div data-testid="workflow-selected-pages">{workflow.selectedPages.join(',')}</div>
      <div data-testid="workflow-requested-pages">{workflow.requestedPageIndexes.join(',')}</div>
      <div data-testid="workflow-can-run">{String(workflow.canRun)}</div>
      <div data-testid="workflow-can-clear">{String(workflow.canClear)}</div>
      <div data-testid="workflow-can-cancel">{String(workflow.canCancel)}</div>
      <div data-testid="workflow-error">{workflow.errorMessage ?? ''}</div>
      <button type="button" onClick={() => void workflow.runSelectedOcr()}>
        Run model OCR
      </button>
      <button type="button" onClick={workflow.clearOcr}>
        Clear model OCR
      </button>
      <button type="button" onClick={workflow.cancelActiveOcr}>
        Cancel model OCR
      </button>
    </div>
  );
}

const pageInput = (pageIndex: number) => ({
  pageIndex,
  imageBytes: new Uint8Array([1, 2, 3]),
  width: 595,
  height: 842,
  imageCount: 1,
});

describe('useOcrRunWorkflow', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('creates a ready execution model from explicit selected pages', () => {
    render(
      <WorkflowProbe
        documentFingerprint="workflow-doc"
        selectedPageIndexes={[1]}
        pageCount={3}
        pages={[pageInput(1)]}
      />,
    );

    expect(screen.getByTestId('workflow-state').textContent).toBe('ready');
    expect(screen.getByTestId('workflow-fingerprint').textContent).toBe('workflow-doc');
    expect(screen.getByTestId('workflow-selected-pages').textContent).toBe('1');
    expect(screen.getByTestId('workflow-requested-pages').textContent).toBe('1');
    expect(screen.getByTestId('workflow-can-run').textContent).toBe('true');
    expect(screen.getByTestId('workflow-can-clear').textContent).toBe('true');
    expect(screen.getByTestId('workflow-can-cancel').textContent).toBe('false');
  });

  it('stays idle when no PDF bytes or raster page inputs are available', () => {
    render(
      <WorkflowProbe
        documentFingerprint="workflow-no-source"
        selectedPageIndexes={[0]}
        pageCount={1}
      />,
    );

    expect(screen.getByTestId('workflow-state').textContent).toBe('idle');
    expect(screen.getByTestId('workflow-can-run').textContent).toBe('false');
  });

  it('falls back to store-selected OCR pages when props do not provide a page selection', () => {
    useOcrStore.getState().setSelectedOcrPages([2]);

    render(
      <WorkflowProbe
        documentFingerprint="workflow-store-pages"
        pageCount={4}
      />,
    );

    expect(screen.getByTestId('workflow-selected-pages').textContent).toBe('2');
    expect(screen.getByTestId('workflow-requested-pages').textContent).toBe('2');
  });

  it('does not mark a stale OCR result from another document as complete', () => {
    useOcrStore.getState().setOcrResult(
      createOcrDemoResult('clean-text', 'previous-document'),
    );

    render(
      <WorkflowProbe
        documentFingerprint="current-document"
        selectedPageIndexes={[0]}
        pages={[pageInput(0)]}
      />,
    );

    expect(useOcrStore.getState().correctedResult?.documentFingerprint).toBe('previous-document');
    expect(screen.getByTestId('workflow-state').textContent).toBe('ready');
  });

  it('runs mock OCR through the model and clears through the guarded command', async () => {
    render(
      <WorkflowProbe
        documentFingerprint="workflow-run"
        selectedPageIndexes={[0]}
        pages={[pageInput(0)]}
      />,
    );

    fireEvent.click(screen.getByText('Run model OCR'));

    await waitFor(() => {
      expect(screen.getByTestId('workflow-state').textContent).toBe('complete');
    });

    expect(useOcrStore.getState().correctedResult?.documentFingerprint).toBe('workflow-run');
    expect(useOcrStore.getState().resumeToken).toMatchObject({
      schema: 'pdf-hub-ocr-resume',
      documentFingerprint: 'workflow-run',
    });
    expect(
      useOcrStore.getState().resumeToken?.tasks.every(
        (task) => task.status === 'completed',
      ),
    ).toBe(true);

    fireEvent.click(screen.getByText('Clear model OCR'));

    await waitFor(() => {
      expect(useOcrStore.getState().correctedResult).toBeNull();
    });

    expect(useOcrStore.getState().resumeToken).toBeNull();
    expect(screen.getByTestId('workflow-state').textContent).toBe('ready');
  });

  it('restores pending checkpoint pages as a runnable workflow even with partial OCR results', () => {
    useOcrStore.getState().setOcrResult(
      createOcrDemoResult('clean-text', 'workflow-resume'),
    );
    useOcrStore.getState().setOcrResumeToken(
      makeResumeToken('workflow-resume'),
    );

    render(
      <WorkflowProbe
        documentFingerprint="workflow-resume"
        pageCount={2}
        pages={[pageInput(0), pageInput(1)]}
      />,
    );

    expect(screen.getByTestId('workflow-requested-pages').textContent).toBe('0,1');
    expect(screen.getByTestId('workflow-state').textContent).toBe('ready');
    expect(screen.getByTestId('workflow-can-run').textContent).toBe('true');
  });

  it('does not mark an idle/ready model as cancelled when cancel is not available', () => {
    render(
      <WorkflowProbe
        documentFingerprint="workflow-cancel-guard"
        selectedPageIndexes={[0]}
        pages={[pageInput(0)]}
      />,
    );

    fireEvent.click(screen.getByText('Cancel model OCR'));

    expect(screen.getByTestId('workflow-state').textContent).toBe('ready');
    expect(screen.getByTestId('workflow-error').textContent).toBe('');
    expect(screen.getByTestId('workflow-can-cancel').textContent).toBe('false');
  });
function makeResumeToken(
  documentFingerprint: string,
): OcrResumeTokenV1 {
  return {
    schema: 'pdf-hub-ocr-resume',
    schemaVersion: 1,
    documentFingerprint,
    engineId: 'mock',
    profileId: 'clean-scan',
    executionConfig: {
      forceOcr: false,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    },
    createdAt: '2026-09-23T00:00:00.000Z',
    tasks: [
      {
        id: 'ocr-batch-1',
        index: 0,
        pageIndexes: [0],
        status: 'completed',
      },
      {
        id: 'ocr-batch-2',
        index: 1,
        pageIndexes: [1],
        status: 'failed',
        errorMessage: 'Synthetic interrupted batch.',
      },
    ],
  };
}

});
