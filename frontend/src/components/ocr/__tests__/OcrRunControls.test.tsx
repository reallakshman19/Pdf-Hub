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
    const onLanguageHintsChange = vi.fn();
    const onForceOcrChange = vi.fn();

    render(
      <OcrEngineControls
        engines={engineOptions}
        profiles={profileOptions}
        engineId="mock"
        profileId="clean-scan"
        languageHints={['eng']}
        forceOcr={false}
        onEngineChange={onEngineChange}
        onProfileChange={onProfileChange}
        onLanguageHintsChange={onLanguageHintsChange}
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

  it('commits canonical ordered multilingual OCR codes on blur', () => {
    const onLanguageHintsChange = vi.fn();

    render(
      <OcrEngineControls
        engines={engineOptions}
        profiles={profileOptions}
        engineId="tesseract-js"
        profileId="clean-scan"
        languageHints={['eng']}
        forceOcr={false}
        onEngineChange={vi.fn()}
        onProfileChange={vi.fn()}
        onLanguageHintsChange={onLanguageHintsChange}
        onForceOcrChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('ocr-language-input');
    fireEvent.change(input, {
      target: {
        value: 'eng + hin + eng + tam',
      },
    });
    fireEvent.blur(input);

    expect(onLanguageHintsChange).toHaveBeenCalledWith([
      'eng',
      'hin',
      'tam',
    ]);
    expect((input as HTMLInputElement).value).toBe('eng+hin+tam');
  });

  it('keeps invalid language drafts visible and does not commit them', () => {
    const onLanguageHintsChange = vi.fn();

    render(
      <OcrEngineControls
        engines={engineOptions}
        profiles={profileOptions}
        engineId="tesseract-js"
        profileId="clean-scan"
        languageHints={['eng']}
        forceOcr={false}
        onEngineChange={vi.fn()}
        onProfileChange={vi.fn()}
        onLanguageHintsChange={onLanguageHintsChange}
        onForceOcrChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('ocr-language-input');
    fireEvent.change(input, {
      target: {
        value: 'eng+$bad',
      },
    });
    fireEvent.blur(input);

    expect(onLanguageHintsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'Invalid OCR language identifier',
    );
    expect((input as HTMLInputElement).value).toBe('eng+$bad');
  });

  it('disables engine configuration while OCR is running', () => {
    render(
      <OcrEngineControls
        engines={engineOptions}
        profiles={profileOptions}
        engineId="mock"
        profileId="clean-scan"
        languageHints={['eng']}
        forceOcr={false}
        disabled
        onEngineChange={vi.fn()}
        onProfileChange={vi.fn()}
        onLanguageHintsChange={vi.fn()}
        onForceOcrChange={vi.fn()}
      />,
    );

    expect(
      (screen.getByTestId('ocr-engine-select') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId('ocr-language-input') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Force OCR even if embedded text exists/i) as HTMLInputElement).disabled,
    ).toBe(true);
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
