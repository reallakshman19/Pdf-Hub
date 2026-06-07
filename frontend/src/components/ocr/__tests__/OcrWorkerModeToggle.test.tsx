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
import { OcrWorkerModeToggle } from '../OcrWorkerModeToggle';

describe('OcrWorkerModeToggle', () => {
  it('renders disabled main-thread mode', () => {
    render(
      <OcrWorkerModeToggle
        enabled={false}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-worker-mode-toggle')).toBeTruthy();
    expect(screen.getByText(/OCR Worker Mode/)).toBeTruthy();
    expect(screen.getByText(/Deprecated compatibility control/)).toBeTruthy();
    expect(screen.getByText(/Main-thread mode is active/)).toBeTruthy();
  });

  it('renders enabled worker mode', () => {
    render(
      <OcrWorkerModeToggle
        enabled
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-worker-mode-checkbox')).toBeChecked();
    expect(screen.getByText(/Worker mode is enabled/)).toBeTruthy();
  });

  it('emits change when toggled', () => {
    let enabled = false;

    render(
      <OcrWorkerModeToggle
        enabled={enabled}
        onChange={(next) => {
          enabled = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-worker-mode-checkbox'));

    expect(enabled).toBe(true);
  });

  it('disables checkbox while OCR is running', () => {
    render(
      <OcrWorkerModeToggle
        enabled={false}
        disabled
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-worker-mode-checkbox')).toBeDisabled();
  });
});
