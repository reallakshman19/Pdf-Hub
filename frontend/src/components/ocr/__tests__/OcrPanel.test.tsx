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

import { OcrPanel } from '../OcrPanel';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { createOcrDemoResult } from '@/core/ocr/fixtures/ocrDemoFixtures';
import type { OcrResumeTokenV1 } from '@/core/ocr/ocrResumeState';

const pageInputs = [
  {
    pageIndex: 0,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
    imageCount: 1,
  },
  {
    pageIndex: 1,
    imageBytes: new Uint8Array([4, 5, 6]),
    width: 595,
    height: 842,
    imageCount: 1,
  },
];

describe('OcrPanel primary workflow', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('starts with page scope + recognition and keeps review/export out of the empty state', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-panel"
        selectedPageIndexes={[0]}
        pageCount={2}
        pages={pageInputs}
      />,
    );

    expect(screen.getByTestId('ocr-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-page-scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: /recognize text/i })).toBeTruthy();
    expect(screen.queryByTestId('ocr-review-section')).toBeNull();
    expect(screen.queryByTestId('ocr-export-section')).toBeNull();

    const runSettings = screen.getByTestId('ocr-run-advanced-settings') as HTMLDetailsElement;
    const advancedWorkflow = screen.getByTestId('ocr-advanced-workflow') as HTMLDetailsElement;

    expect(runSettings.open).toBe(false);
    expect(advancedWorkflow.open).toBe(false);
  });

  it('shows Resume OCR when a compatible checkpoint is restored', () => {
    useOcrStore.getState().setOcrResult(
      createOcrDemoResult('clean-text', 'doc-resume-panel'),
    );
    useOcrStore.getState().setOcrResumeToken(
      makeResumeToken('doc-resume-panel'),
    );

    render(
      <OcrPanel
        documentFingerprint="doc-resume-panel"
        selectedPageIndexes={[0, 1]}
        pageCount={2}
        pages={pageInputs}
      />,
    );

    expect(
      screen.getByRole('button', { name: /resume ocr/i }),
    ).toBeTruthy();
    expect(screen.getByTestId('ocr-run-status').textContent).toMatch(
      /checkpoint restored/i,
    );
  });

  it('restores checkpoint page scope instead of defaulting reopened OCR to all pages', () => {
    const token: OcrResumeTokenV1 = {
      ...makeResumeToken('doc-resume-subset'),
      tasks: [
        {
          id: 'ocr-batch-1',
          index: 0,
          pageIndexes: [1],
          status: 'failed',
          errorMessage: 'Interrupted selected-page OCR.',
        },
      ],
    };

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-resume-subset',
      resumeToken: token,
    });

    render(
      <OcrPanel
        documentFingerprint="doc-resume-subset"
        selectedPageIndexes={[]}
        pageCount={2}
        pages={pageInputs}
      />,
    );

    const resume = screen.getByRole('radio', { name: /resume/i }) as HTMLInputElement;
    expect(resume.checked).toBe(true);
    expect(screen.getByText('1 checkpoint page')).toBeTruthy();
    expect(screen.getByRole('button', { name: /resume ocr/i })).toBeTruthy();
  });

  it('hides Resume scope when the checkpoint has no pending batches', () => {
    const token: OcrResumeTokenV1 = {
      ...makeResumeToken('doc-resume-complete'),
      tasks: [
        {
          id: 'ocr-batch-1',
          index: 0,
          pageIndexes: [0],
          status: 'completed',
        },
      ],
    };

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-resume-complete',
      result: createOcrDemoResult('clean-text', 'doc-resume-complete'),
      resumeToken: token,
    });

    render(
      <OcrPanel
        documentFingerprint="doc-resume-complete"
        selectedPageIndexes={[]}
        pageCount={1}
        pages={[pageInputs[0]]}
      />,
    );

    expect(screen.queryByRole('radio', { name: /resume/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /resume ocr/i })).toBeNull();
  });

  it('disables recognition when no real PDF or raster source exists', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-no-source"
        pageCount={2}
      />,
    );

    expect(screen.getByTestId('run-ocr-button')).toBeDisabled();
  });

  it('keeps engine and execution controls behind OCR settings', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-settings"
        selectedPageIndexes={[0]}
        pageCount={2}
        pages={pageInputs}
      />,
    );

    const settings = screen.getByTestId('ocr-run-advanced-settings') as HTMLDetailsElement;
    expect(settings.open).toBe(false);

    fireEvent.click(screen.getByText('OCR settings'));

    expect(settings.open).toBe(true);
    expect(screen.getByTestId('ocr-engine-select')).toBeTruthy();
    expect(screen.getByTestId('ocr-pipeline-mode-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-execution-settings-panel')).toBeTruthy();

    fireEvent.change(screen.getByTestId('ocr-engine-select'), {
      target: { value: 'tesseract-js' },
    });
    fireEvent.click(screen.getByLabelText('Force OCR even if embedded text exists'));

    expect(useOcrStore.getState().engineId).toBe('tesseract-js');
    expect(useOcrStore.getState().forceOcr).toBe(true);
  });

  it('runs recognition then reveals review and searchable-PDF actions', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-run"
        selectedPageIndexes={[0]}
        pageCount={2}
        pages={pageInputs}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    expect(screen.getByTestId('ocr-run-status').textContent).toMatch(/OCR complete/i);
    expect(screen.getByTestId('ocr-review-section')).toBeTruthy();
    expect(screen.getByTestId('ocr-result-summary')).toBeTruthy();
    expect(screen.getByTestId('ocr-export-section')).toBeTruthy();
    expect(screen.getByTestId('ocr-searchable-pdf-export-button')).toBeTruthy();
    expect(screen.getByTestId('clear-ocr-button')).toBeTruthy();
  });

  it('supports OCR search and correction after recognition', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-review"
        selectedPageIndexes={[0]}
        pageCount={1}
        pages={[pageInputs[0]]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().searchIndex).not.toBeNull();
    });

    const searchInput = screen.getByPlaceholderText('Search OCR result');
    fireEvent.change(searchInput, { target: { value: 'writer' } });

    await waitFor(() => {
      expect(screen.getAllByTestId('ocr-search-match').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText('P1pe'));
    expect(screen.getByTestId('ocr-correction-panel')).toBeTruthy();

    fireEvent.change(screen.getByTestId('ocr-correction-input'), {
      target: { value: 'Pipe' },
    });
    fireEvent.click(screen.getByTestId('ocr-correction-save'));

    expect(useOcrStore.getState().corrections[0]?.correctedText).toBe('Pipe');
  });

  it('reset returns the UI to the recognition start state', async () => {
    render(
      <OcrPanel
        documentFingerprint="doc-reset"
        selectedPageIndexes={[0]}
        pageCount={1}
        pages={[pageInputs[0]]}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-review-section')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('clear-ocr-button'));

    expect(useOcrStore.getState().correctedResult).toBeNull();
    expect(screen.queryByTestId('ocr-review-section')).toBeNull();
    expect(screen.queryByTestId('ocr-export-section')).toBeNull();
    expect(screen.getByRole('button', { name: /recognize text/i })).toBeTruthy();
  });

  it('shows stored real-document regions without exposing a synthetic region tool', () => {
    useOcrStore.getState().addOcrRegion({
      id: 'region-real-document',
      documentFingerprint: 'doc-region',
      pageIndex: 0,
      mode: 'table',
      bbox: {
        x: 60,
        y: 100,
        width: 240,
        height: 120,
      },
    });

    render(
      <OcrPanel
        documentFingerprint="doc-region"
        selectedPageIndexes={[0]}
        pageCount={1}
        pages={[pageInputs[0]]}
      />,
    );

    expect(screen.getByTestId('ocr-review-section')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-list-panel')).toBeTruthy();
    expect(screen.getByText('Selected area on document')).toBeTruthy();
    expect(screen.queryByTestId('ocr-region-tool')).toBeNull();
    expect(screen.queryByTestId('ocr-region-canvas')).toBeNull();
  });

  it('keeps project restore and diagnostics under Advanced and troubleshooting', () => {
    render(
      <OcrPanel
        documentFingerprint="doc-advanced"
        selectedPageIndexes={[0]}
        pageCount={1}
        pages={[pageInputs[0]]}
      />,
    );

    const advanced = screen.getByTestId('ocr-advanced-workflow') as HTMLDetailsElement;
    expect(advanced.open).toBe(false);

    fireEvent.click(screen.getByText('Advanced and troubleshooting'));

    expect(advanced.open).toBe(true);
    expect(screen.getByTestId('ocr-project-section')).toBeTruthy();
    expect(screen.getByTestId('ocr-diagnostics-section')).toBeTruthy();
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
        pageIndexes: [0, 1],
        status: 'failed',
        errorMessage: 'Synthetic interrupted batch.',
      },
    ],
  };
}

});
