import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingScaleBar } from './DrawingScaleBar';
import type { ScaleCalibration } from '../../core/annotations/calibration';

describe('DrawingScaleBar', () => {
  it('renders scale badge and calls onOpenCalibration when clicked', () => {
    const onOpen = vi.fn();
    const cal: ScaleCalibration = {
      scaleRatio: 100,
      unit: 'mm',
      precision: 0,
    };

    render(
      <DrawingScaleBar
        calibration={cal}
        onOpenCalibration={onOpen}
      />,
    );

    expect(screen.getByText(/Scale: 1:100 \(mm\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders graphic bar division ticks and values', () => {
    const cal: ScaleCalibration = {
      scaleRatio: 100,
      unit: 'mm',
      precision: 0,
    };

    render(
      <DrawingScaleBar
        calibration={cal}
      />,
    );

    expect(screen.getByTestId('scale-bar-svg')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    // 25.4 mm * 100 = 2540 mm = ~2.5 m
    expect(screen.getByText(/2\.5 m/)).toBeInTheDocument();
  });
});
