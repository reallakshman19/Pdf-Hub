import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CadGridOverlay } from './CadGridOverlay';

describe('CadGridOverlay', () => {
  it('renders nothing when gridMode is none', () => {
    const { container } = render(
      <CadGridOverlay
        gridMode="none"
        scale={1}
        width={800}
        height={600}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('cad-grid-overlay')).toBeNull();
  });

  it('renders orthogonal grid pattern when gridMode is ortho', () => {
    render(
      <CadGridOverlay
        gridMode="ortho"
        spacing={20}
        scale={1}
        width={800}
        height={600}
      />,
    );

    const overlay = screen.getByTestId('cad-grid-overlay');
    expect(overlay).toBeInTheDocument();
    const pattern = overlay.querySelector('pattern');
    expect(pattern).toBeInTheDocument();
    expect(pattern?.getAttribute('id')).toContain('cad-ortho-grid');
    expect(pattern?.getAttribute('width')).toBe('20');
    expect(pattern?.getAttribute('height')).toBe('20');
  });

  it('renders isometric diamond grid pattern when gridMode is isometric', () => {
    render(
      <CadGridOverlay
        gridMode="isometric"
        isoplane="all"
        spacing={20}
        scale={1}
        width={800}
        height={600}
      />,
    );

    const overlay = screen.getByTestId('cad-grid-overlay');
    expect(overlay).toBeInTheDocument();
    const pattern = overlay.querySelector('pattern');
    expect(pattern).toBeInTheDocument();
    expect(pattern?.getAttribute('id')).toContain('cad-iso-grid');

    // isoCellW = 20 * sqrt(3) ~= 34.641
    const width = Number(pattern?.getAttribute('width'));
    expect(width).toBeCloseTo(34.64, 1);
    expect(pattern?.getAttribute('height')).toBe('20');
  });

  it('avoids rendering when scaled spacing is less than 4px threshold to prevent visual blur', () => {
    const { container } = render(
      <CadGridOverlay
        gridMode="ortho"
        spacing={10}
        scale={0.1} // scaledSpacing = 1px < 4px
        width={800}
        height={600}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
