import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PS_ISONOTE_ADMISSION_LIMITS } from '@/core/macro/psIsonote/psIsonoteAdmission';
import { PsIsonoteRecipeBuilder } from './PsIsonoteRecipeBuilder';

afterEach(() => {
  cleanup();
});

describe('PsIsonoteRecipeBuilder admission', () => {
  it('rejects an oversized uploaded file without ever calling File.text()', async () => {
    const { container } = render(<PsIsonoteRecipeBuilder />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    let textCalled = false;
    const oversizedFile = new File(['ignored'], 'huge.csv', { type: 'text/csv' });
    Object.defineProperty(oversizedFile, 'size', {
      value: PS_ISONOTE_ADMISSION_LIMITS.maxUploadedSourceBytes + 1,
    });
    oversizedFile.text = async () => {
      textCalled = true;
      return 'x'.repeat(1000);
    };

    await fireEvent.change(input, { target: { files: [oversizedFile] } });

    expect(textCalled).toBe(false);
    expect(await screen.findByText(/PS\/ISONOTE admission rejected/i)).toBeTruthy();
  });

  it('rejects pasted/typed text past the code-unit limit without updating the textarea value', () => {
    render(<PsIsonoteRecipeBuilder />);
    const textarea = screen.getByLabelText('PS No. versus ISONOTE table') as HTMLTextAreaElement;

    const huge = 'x'.repeat(PS_ISONOTE_ADMISSION_LIMITS.maxPastedSourceCodeUnits + 1);
    fireEvent.change(textarea, { target: { value: huge } });

    expect(textarea.value).toBe('');
    expect(screen.getByText(/PS\/ISONOTE admission rejected/i)).toBeTruthy();
  });
});
