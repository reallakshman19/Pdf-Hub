import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PS_ISONOTE_SAMPLES } from '@/core/macro/psIsonote/psIsonoteSamples';
import { PsIsonoteSampleLoader } from './PsIsonoteSampleLoader';

describe('PsIsonoteSampleLoader', () => {
  it('loads and downloads each embedded sample through accessible icon controls', () => {
    const onLoad = vi.fn();
    const onDownload = vi.fn();
    render(<PsIsonoteSampleLoader onLoad={onLoad} onDownload={onDownload} />);

    for (const sample of PS_ISONOTE_SAMPLES) {
      fireEvent.click(
        screen.getByRole('button', {
          name: `Load ${sample.label} PS ISONOTE sample`,
        }),
      );
      expect(onLoad).toHaveBeenLastCalledWith(sample);

      fireEvent.click(
        screen.getByRole('button', {
          name: `Download ${sample.label} PS ISONOTE sample`,
        }),
      );
      expect(onDownload).toHaveBeenLastCalledWith(sample);
    }

    expect(onLoad).toHaveBeenCalledTimes(PS_ISONOTE_SAMPLES.length);
    expect(onDownload).toHaveBeenCalledTimes(PS_ISONOTE_SAMPLES.length);
    expect(screen.getByText(/download the source file/i)).toBeTruthy();
    expect(screen.getByText(/spaces alone do not create separate columns/i)).toBeTruthy();
  });

  it('disables load and download controls during active work', () => {
    render(
      <PsIsonoteSampleLoader
        disabled
        onLoad={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    for (const sample of PS_ISONOTE_SAMPLES) {
      const loadButton = screen.getByRole('button', {
        name: `Load ${sample.label} PS ISONOTE sample`,
      }) as HTMLButtonElement;
      const downloadButton = screen.getByRole('button', {
        name: `Download ${sample.label} PS ISONOTE sample`,
      }) as HTMLButtonElement;

      expect(loadButton.disabled).toBe(true);
      expect(downloadButton.disabled).toBe(true);
    }
  });
});
