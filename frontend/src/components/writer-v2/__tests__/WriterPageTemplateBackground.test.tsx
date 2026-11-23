import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WriterPageTemplateBackground } from '../WriterPageTemplateBackground';
import type { WriterPageSetupV2 } from '@/core/writer-v2/types';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';

describe('WriterPageTemplateBackground', () => {
  const baseSetup: WriterPageSetupV2 = {
    ...WRITER_PAGE_PRESETS.A4,
  };

  it('renders nothing when template kind is blank', () => {
    const { container } = render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: { kind: 'blank' },
        }}
        pageIndex={0}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('writer-page-template-background')).toBeNull();
  });

  it('renders ruled lines and margin line', () => {
    render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'ruled',
            spacing: 24,
            lineColor: '#cbd5e1',
            marginLineColor: '#fca5a5',
            showMarginLine: true,
          },
        }}
        pageIndex={0}
      />,
    );

    const svg = screen.getByTestId('writer-page-template-background');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('data-template-kind', 'ruled');
    expect(screen.getByTestId('template-ruled-group')).toBeInTheDocument();

    const lines = screen.getAllByTestId('template-ruled-line');
    expect(lines.length).toBeGreaterThan(20);
    expect(lines[0]).toHaveAttribute('stroke', '#cbd5e1');

    const marginLine = screen.getByTestId('template-ruled-margin-line');
    expect(marginLine).toBeInTheDocument();
    expect(marginLine).toHaveAttribute('stroke', '#fca5a5');
  });

  it('renders grid lines matrix', () => {
    render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'grid',
            spacing: 30,
            lineColor: '#e2e8f0',
          },
        }}
        pageIndex={0}
      />,
    );

    const svg = screen.getByTestId('writer-page-template-background');
    expect(svg).toHaveAttribute('data-template-kind', 'grid');
    expect(screen.getByTestId('template-grid-group')).toBeInTheDocument();

    const gridLines = screen.getAllByTestId('template-grid-line');
    expect(gridLines.length).toBeGreaterThan(30);
  });

  it('renders dot grid matrix', () => {
    render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'dot-grid',
            spacing: 25,
            dotSize: 2,
            lineColor: '#94a3b8',
          },
        }}
        pageIndex={0}
      />,
    );

    const svg = screen.getByTestId('writer-page-template-background');
    expect(svg).toHaveAttribute('data-template-kind', 'dot-grid');
    expect(screen.getByTestId('template-dot-grid-group')).toBeInTheDocument();

    const dots = screen.getAllByTestId('template-dot');
    expect(dots.length).toBeGreaterThan(100);
    expect(dots[0]).toHaveAttribute('r', '1'); // dotSize 2 / 2
    expect(dots[0]).toHaveAttribute('fill', '#94a3b8');
  });

  it('renders Cornell notes layout with dividers and ruled lines', () => {
    render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'cornell',
            spacing: 24,
            marginLineColor: '#94a3b8',
          },
        }}
        pageIndex={0}
      />,
    );

    const svg = screen.getByTestId('writer-page-template-background');
    expect(svg).toHaveAttribute('data-template-kind', 'cornell');
    expect(screen.getByTestId('template-cornell-header-line')).toBeInTheDocument();
    expect(screen.getByTestId('template-cornell-summary-line')).toBeInTheDocument();
    expect(screen.getByTestId('template-cornell-cue-line')).toBeInTheDocument();

    const cornellRuled = screen.getAllByTestId('template-cornell-ruled-line');
    expect(cornellRuled.length).toBeGreaterThan(15);
  });

  it('renders music manuscript staves', () => {
    render(
      <WriterPageTemplateBackground
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'music-staff',
            spacing: 8,
          },
        }}
        pageIndex={0}
      />,
    );

    const svg = screen.getByTestId('writer-page-template-background');
    expect(svg).toHaveAttribute('data-template-kind', 'music-staff');
    expect(screen.getByTestId('template-music-staff-group')).toBeInTheDocument();

    const staves = screen.getAllByTestId('template-music-staff');
    expect(staves.length).toBeGreaterThan(6);

    const staffLines = screen.getAllByTestId('template-staff-line');
    expect(staffLines.length).toBe(staves.length * 5);
  });

  it('honors per-page template override', () => {
    const setupWithOverride: WriterPageSetupV2 = {
      ...baseSetup,
      pageTemplate: { kind: 'ruled' },
      pageTemplates: {
        1: { kind: 'grid' },
      },
    };

    const { unmount } = render(
      <WriterPageTemplateBackground
        pageSetup={setupWithOverride}
        pageIndex={0}
      />,
    );
    expect(screen.getByTestId('writer-page-template-background')).toHaveAttribute('data-template-kind', 'ruled');
    unmount();

    render(
      <WriterPageTemplateBackground
        pageSetup={setupWithOverride}
        pageIndex={1}
      />,
    );
    expect(screen.getByTestId('writer-page-template-background')).toHaveAttribute('data-template-kind', 'grid');
  });
});
