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
import {
  createOcrExecutionPolicy,
  type OcrExecutionPolicy,
} from '@/core/ocr/ocrExecutionPolicy';
import { OcrExecutionSettingsPanel } from '../OcrExecutionSettingsPanel';

describe('OcrExecutionSettingsPanel', () => {
  it('renders execution settings', () => {
    render(
      <OcrExecutionSettingsPanel
        policy={createOcrExecutionPolicy()}
        estimatedMemoryBytes={10 * 1024 * 1024}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-execution-settings-panel')).toBeTruthy();
    expect(screen.getByText('OCR Performance')).toBeTruthy();
    expect(screen.getByTestId('ocr-execution-memory').textContent).toContain('10 MB');
  });

  it('updates preset', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-execution-preset'), {
      target: {
        value: 'fast',
      },
    });

    expect(policy.preset).toBe('fast');
    expect(policy.rasterScale).toBe(1.5);
  });

  it('updates preprocessing mode', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-execution-preprocessing'), {
      target: {
        value: 'sauvola',
      },
    });

    expect(policy.preprocessing).toEqual({ mode: 'sauvola' });
  });

  it('updates numeric policy fields', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-execution-scale'), {
      target: {
        value: '3',
      },
    });

    expect(policy.rasterScale).toBe(3);

    fireEvent.change(screen.getByTestId('ocr-execution-max-pages'), {
      target: {
        value: '5',
      },
    });

    expect(policy.maxPagesPerJob).toBe(5);
  });

  it('updates allow large jobs', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-execution-allow-large'));

    expect(policy.allowLargeJobs).toBe(true);
  });

  it('shows cancel button while running', () => {
    let cancelled = false;

    render(
      <OcrExecutionSettingsPanel
        policy={createOcrExecutionPolicy()}
        running
        onChange={() => undefined}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-execution-cancel'));

    expect(cancelled).toBe(true);
  });

  it('updates domain lexicon and fallback settings', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-execution-domain-lexicon'), {
      target: {
        value: 'none',
      },
    });
    expect(policy.domainLexicon).toBe('none');

    fireEvent.click(screen.getByTestId('ocr-execution-multi-pass'));
    expect(policy.multiPass).toBe(false);

    fireEvent.click(screen.getByTestId('ocr-execution-preserve-spaces'));
    expect(policy.preserveInterwordSpaces).toBe(false);
  });

  it('selects fast mode and 10-page batch mode from shortcut buttons', () => {
    let policy: OcrExecutionPolicy = createOcrExecutionPolicy();

    render(
      <OcrExecutionSettingsPanel
        policy={policy}
        onChange={(next) => {
          policy = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-mode-batch-button'));
    expect(policy.preset).toBe('ten-page-batch');
    expect(policy.rasterScale).toBe(3);
    expect(policy.batchChunkSize).toBe(10);

    fireEvent.click(screen.getByTestId('ocr-mode-fast-button'));
    expect(policy.preset).toBe('fast');
    expect(policy.rasterScale).toBe(1.5);
  });
});
