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

describe('OCR run workflow controls', () => {
  it('renders engine controls and emits profile/force changes', () => {
    const onEngineChange = vi.fn();
    const onProfileChange = vi.fn();
    const onForceOcrChange = vi.fn();

    render(
      <OcrEngineControls
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

  it('renders run actions and respects running state', () => {
    const onRun = vi.fn();
    const onClear = vi.fn();

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
      />,
    );

    const runButton = screen.getByTestId('run-ocr-button') as HTMLButtonElement;

    expect(runButton.disabled).toBe(true);
    expect(screen.getByText('Running')).toBeTruthy();
  });
});
