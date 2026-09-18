import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  OcrEngineControls,
  OcrRunActions,
} from '../workflow/OcrRunControls';

const engineOptions = [
  {
    id: 'mock',
    label: 'Mock OCR',
  },
  {
    id: 'tesseract-js',
    label: 'Tesseract.js OCR',
  },
];

const profileOptions = [
  {
    id: 'clean-scan' as const,
    label: 'Clean scan',
  },
  {
    id: 'table-heavy' as const,
    label: 'Table-heavy document',
  },
];

describe('OCR run workflow controls', () => {
  it('renders engine controls and emits profile/force changes', () => {
    const onEngineChange = vi.fn();
    const onProfileChange = vi.fn();
    const onForceOcrChange = vi.fn();

    render(
      <OcrEngineControls
        engines={engineOptions}
        profiles={profileOptions}
        engineId="mock"
        profileId="clean-scan"
        forceOcr={false}
        onEngineChange={onEngineChange}
        onProfileChange={onProfileChange}
        onForceOcrChange={onForceOcrChange}
      />,
    );

    const engineSelect = screen.getByTestId('ocr-engine-select');
    const profileSelect = screen.getByDisplayValue('Clean scan');
    const forceCheckbox = screen.getByLabelText(/Force OCR even if embedded text exists/i);

    expect(screen.getByTestId('ocr-engine-controls-workflow')).toBeTruthy();
    expect(engineSelect).toBeTruthy();

    fireEvent.change(engineSelect, { target: { value: 'tesseract-js' } });
    fireEvent.change(profileSelect, { target: { value: 'table-heavy' } });
    fireEvent.click(forceCheckbox);

    expect(onEngineChange).toHaveBeenCalledWith('tesseract-js');
    expect(onProfileChange).toHaveBeenCalledWith('table-heavy');
    expect(onForceOcrChange).toHaveBeenCalledWith(true);
  });

  it('renders run actions and disables unsafe actions while running', () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <OcrRunActions
        running={false}
        onRun={onRun}
        onClear={onClear}
      />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));
    fireEvent.click(screen.getByTestId('clear-ocr-button'));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(
      <OcrRunActions
        running
        onRun={onRun}
        onClear={onClear}
        onCancel={onCancel}
      />,
    );

    const runButton = screen.getByTestId('run-ocr-button') as HTMLButtonElement;
    const clearButton = screen.getByTestId('clear-ocr-button') as HTMLButtonElement;

    expect(runButton.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);
    expect(screen.getByText('Recognizing')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cancel-ocr-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('supports disabling recognition when no document source is available', () => {
    render(
      <OcrRunActions
        running={false}
        runDisabled
        onRun={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const runButton = screen.getByTestId('run-ocr-button') as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);
  });

  it('supports explicitly disabling clear when not running', () => {
    render(
      <OcrRunActions
        running={false}
        clearDisabled
        onRun={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const clearButton = screen.getByTestId('clear-ocr-button') as HTMLButtonElement;

    expect(clearButton.disabled).toBe(true);
  });
});
