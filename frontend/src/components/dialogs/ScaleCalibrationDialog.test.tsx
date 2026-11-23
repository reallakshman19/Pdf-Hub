import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScaleCalibrationDialog } from './ScaleCalibrationDialog';

describe('ScaleCalibrationDialog', () => {
  it('renders scale presets and selects a standard architectural scale', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ScaleCalibrationDialog
        isOpen
        currentPage={1}
        totalDocumentPages={4}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    expect(screen.getByText('Drawing Scale Calibration')).toBeInTheDocument();

    // Select 1:50 preset
    const select = screen.getByRole('combobox', { name: /standard scale preset/i });
    fireEvent.change(select, { target: { value: '1:50 (Piping / Structural)' } });

    // Click Apply
    fireEvent.click(screen.getByRole('button', { name: /apply calibration/i }));
    expect(onApply).toHaveBeenCalledWith(
      {
        scaleRatio: 50,
        unit: 'mm',
        precision: 0,
      },
      'page',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('calculates custom scale ratio from 2 known points and applies to all pages', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ScaleCalibrationDialog
        isOpen
        currentPage={2}
        totalDocumentPages={5}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    // Expand 2-point calibration
    fireEvent.click(screen.getByText(/calibrate by known measurement/i));

    // Enter known real distance (2200 mm) and measured points length (62.36 pt)
    const knownInput = screen.getByLabelText(/known real distance/i);
    const measuredInput = screen.getByLabelText(/measured points length/i);

    fireEvent.change(knownInput, { target: { value: '2200' } });
    fireEvent.change(measuredInput, { target: { value: '62.36' } });

    // Compute ratio
    fireEvent.click(screen.getByRole('button', { name: /compute & apply ratio/i }));

    // Select "All Pages" scope
    const allPagesRadio = screen.getByRole('radio', { name: /all pages/i });
    fireEvent.click(allPagesRadio);

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /apply calibration/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: 'mm',
      }),
      'all',
    );
    // 2200 / ((62.36 / 72) * 25.4) ~ 100
    const appliedCall = onApply.mock.calls[0][0];
    expect(appliedCall.scaleRatio).toBeGreaterThan(90);
    expect(appliedCall.scaleRatio).toBeLessThan(110);
  });
});
