import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import {
  OcrDiagnosticsSection,
  OcrExportSection,
  OcrProjectSection,
  OcrReviewSection,
  OcrRunSection,
  OcrSectionShell,
} from '../sections';

describe('OCR section components', () => {
  it('renders section shell with title, description, actions, and content', () => {
    render(
      <OcrSectionShell
        title="Shell title"
        description="Shell description"
        actions={<button type="button">Action</button>}
      >
        <div>Shell content</div>
      </OcrSectionShell>,
    );

    expect(screen.getByText('Shell title')).toBeTruthy();
    expect(screen.getByText('Shell description')).toBeTruthy();
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Shell content')).toBeTruthy();
  });

  it('renders run section slots', () => {
    render(
      <OcrRunSection
        engineControls={<div>Engine controls</div>}
        pipelineMode={<div>Pipeline mode</div>}
        workerMode={<div>Worker mode</div>}
        executionSettings={<div>Execution settings</div>}
        executionDiagnostics={<div>Execution diagnostics</div>}
        batchQueue={<div>Batch queue</div>}
        runControls={<button type="button">Trigger OCR</button>}
        errorMessage="OCR failed"
      />,
    );

    expect(screen.getByTestId('ocr-run-section')).toBeTruthy();
    expect(screen.getByText('Engine controls')).toBeTruthy();
    expect(screen.getByText('Pipeline mode')).toBeTruthy();
    expect(screen.getByText('Worker mode')).toBeTruthy();
    expect(screen.getByText('Execution settings')).toBeTruthy();
    expect(screen.getByText('Execution diagnostics')).toBeTruthy();
    expect(screen.getByText('Batch queue')).toBeTruthy();
    expect(screen.getByText('Trigger OCR')).toBeTruthy();
    expect(screen.getByText('OCR failed')).toBeTruthy();
  });

  it('renders review empty state when no review content exists', () => {
    render(
      <OcrReviewSection />,
    );

    expect(screen.getByTestId('ocr-review-section')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-empty')).toBeTruthy();
    expect(screen.getByText(/Run OCR or load a demo fixture/)).toBeTruthy();
  });

  it('renders review section slots', () => {
    render(
      <OcrReviewSection
        resultSummary={<div>Result summary</div>}
        searchPanel={<div>Search panel</div>}
        correctionsPanel={<div>Corrections panel</div>}
        regionTools={<div>Region tools</div>}
        tableReview={<div>Table review</div>}
        writerInsertion={<div>Writer insertion</div>}
      />,
    );

    expect(screen.getByText('Result summary')).toBeTruthy();
    expect(screen.getByText('Search panel')).toBeTruthy();
    expect(screen.getByText('Corrections panel')).toBeTruthy();
    expect(screen.getByText('Region tools')).toBeTruthy();
    expect(screen.getByText('Table review')).toBeTruthy();
    expect(screen.getByText('Writer insertion')).toBeTruthy();
    expect(screen.queryByTestId('ocr-review-empty')).toBeNull();
  });

  it('renders export empty state and slots', () => {
    const { rerender } = render(
      <OcrExportSection />,
    );

    expect(screen.getByTestId('ocr-export-empty')).toBeTruthy();

    rerender(
      <OcrExportSection
        searchablePdfExport={<div>Searchable PDF export</div>}
        projectExport={<div>Project export</div>}
        diagnostics={<div>Export diagnostics</div>}
      />,
    );

    expect(screen.getByText('Searchable PDF export')).toBeTruthy();
    expect(screen.getByText('Project export')).toBeTruthy();
    expect(screen.getByText('Export diagnostics')).toBeTruthy();
    expect(screen.queryByTestId('ocr-export-empty')).toBeNull();
  });

  it('renders project empty state and slots', () => {
    const { rerender } = render(
      <OcrProjectSection />,
    );

    expect(screen.getByTestId('ocr-project-empty')).toBeTruthy();

    rerender(
      <OcrProjectSection
        payloadSummary={<div>Payload summary</div>}
        restorePanel={<div>Restore panel</div>}
        projectActions={<div>Project actions</div>}
      />,
    );

    expect(screen.getByText('Payload summary')).toBeTruthy();
    expect(screen.getByText('Restore panel')).toBeTruthy();
    expect(screen.getByText('Project actions')).toBeTruthy();
    expect(screen.queryByTestId('ocr-project-empty')).toBeNull();
  });

  it('renders diagnostics empty state and messages', () => {
    const { rerender } = render(
      <OcrDiagnosticsSection />,
    );

    expect(screen.getByTestId('ocr-diagnostics-empty')).toBeTruthy();

    rerender(
      <OcrDiagnosticsSection
        messages={[
          {
            level: 'info',
            code: 'INFO_CODE',
            message: 'Info message',
          },
          {
            level: 'warning',
            code: 'WARN_CODE',
            message: 'Warning message',
          },
          {
            level: 'error',
            code: 'ERROR_CODE',
            message: 'Error message',
          },
        ]}
      />,
    );

    expect(screen.getAllByTestId('ocr-diagnostics-message')).toHaveLength(3);
    expect(screen.getByText(/INFO_CODE/)).toBeTruthy();
    expect(screen.getByText(/Warning message/)).toBeTruthy();
    expect(screen.getByText(/Error message/)).toBeTruthy();
    expect(screen.queryByTestId('ocr-diagnostics-empty')).toBeNull();
  });
});
