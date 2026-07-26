import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PS_ISONOTE_SAMPLES } from '@/core/macro/psIsonote/psIsonoteSamples';
import { PsIsonoteSampleLoader } from './PsIsonoteSampleLoader';

describe('PsIsonoteSampleLoader', () => {
  it('loads each embedded sample through an accessible icon button', () => {
    const onLoad = vi.fn();
    render(<PsIsonoteSampleLoader onLoad={onLoad} />);

    for (const sample of PS_ISONOTE_SAMPLES) {
      fireEvent.click(
        screen.getByRole('button', {
          name: `Load ${sample.label} PS ISONOTE sample`,
        }),
      );
      expect(onLoad).toHaveBeenLastCalledWith(sample);
    }

    expect(onLoad).toHaveBeenCalledTimes(PS_ISONOTE_SAMPLES.length);
    expect(screen.getByText(/Spaces alone do not create separate columns/i)).toBeTruthy();
  });

  it('disables all sample buttons during active work', () => {
    render(<PsIsonoteSampleLoader disabled onLoad={vi.fn()} />);

    for (const sample of PS_ISONOTE_SAMPLES) {
      const button = screen.getByRole('button', {
        name: `Load ${sample.label} PS ISONOTE sample`,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
  });
});
