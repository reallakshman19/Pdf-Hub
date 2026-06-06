
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type {
  OcrPipelineMode,
} from '@/core/ocr/ocrPipelineMode';
import { OcrPipelineModePanel } from '../OcrPipelineModePanel';

describe('OcrPipelineModePanel', () => {
  it('renders pipeline mode selector', () => {
    render(
      <OcrPipelineModePanel
        mode="main"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-pipeline-mode-panel')).toBeTruthy();
    expect(screen.getByText('OCR Pipeline Mode')).toBeTruthy();
    expect(screen.getByTestId('ocr-pipeline-effective-mode').textContent).toContain('Main thread');
  });

  it('emits selected pipeline mode', () => {
    let mode: OcrPipelineMode = 'main';

    render(
      <OcrPipelineModePanel
        mode={mode}
        onChange={(next) => {
          mode = next;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-pipeline-mode-select'), {
      target: {
        value: 'worker-ocr',
      },
    });

    expect(mode).toBe('worker-ocr');
  });

  it('shows warning when requested worker mode is unavailable', () => {
    render(
      <OcrPipelineModePanel
        mode="worker-raster-worker-ocr"
        capabilities={{
          workerSupported: false,
          ocrWorkerSupported: false,
          rasterWorkerSupported: false,
        }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-pipeline-mode-warning')).toBeTruthy();
    expect(screen.getByText(/Full worker raster\/OCR pipeline is unavailable/)).toBeTruthy();
    expect(screen.getByTestId('ocr-pipeline-effective-mode').textContent).toContain('Main thread');
  });

  it('disables selector while running', () => {
    render(
      <OcrPipelineModePanel
        mode="main"
        disabled
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-pipeline-mode-select')).toBeDisabled();
  });
});
