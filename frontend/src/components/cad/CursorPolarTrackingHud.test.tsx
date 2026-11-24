import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CursorPolarTrackingHud } from './CursorPolarTrackingHud';

describe('CursorPolarTrackingHud', () => {
  it('renders nothing when origin or current is missing', () => {
    const { container } = render(
      <CursorPolarTrackingHud
        origin={null}
        current={{ x: 100, y: 100 }}
        scale={1}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('cursor-polar-tracking-hud')).toBeNull();
  });

  it('renders polar length, drafting angle, deltas, and axis badge', () => {
    render(
      <CursorPolarTrackingHud
        origin={{ x: 100, y: 100 }}
        current={{ x: 200, y: 100 }} // 100 pt East (0°)
        scale={1}
        calibration={{ scaleRatio: 100, unit: 'mm', precision: 0 }}
      />,
    );

    const hud = screen.getByTestId('cursor-polar-tracking-hud');
    expect(hud).toBeInTheDocument();

    expect(screen.getByText(/3528 mm/)).toBeInTheDocument();
    expect(screen.getByText('∠ 0.0°')).toBeInTheDocument();
    expect(screen.getByText('East (0°)')).toBeInTheDocument();
    expect(screen.getByText(/ΔX:/)).toBeInTheDocument();
    expect(screen.getByText(/ΔY:/)).toBeInTheDocument();
  });

  it('renders isometric axis badge when pointing along 30° ISO East line', () => {
    render(
      <CursorPolarTrackingHud
        origin={{ x: 100, y: 100 }}
        current={{ x: 186.6, y: 50 }} // +86.6x, -50y = +30°
        scale={1}
        calibration={{ scaleRatio: 100, unit: 'mm', precision: 0 }}
      />,
    );

    expect(screen.getByText('ISO East (+30°)')).toBeInTheDocument();
  });

  it('displays Shift Lock badge when isAngleConstrained is true', () => {
    render(
      <CursorPolarTrackingHud
        origin={{ x: 100, y: 100 }}
        current={{ x: 200, y: 100 }}
        scale={1}
        isAngleConstrained={true}
      />,
    );

    expect(screen.getByText('SHIFT LOCK')).toBeInTheDocument();
  });
});
