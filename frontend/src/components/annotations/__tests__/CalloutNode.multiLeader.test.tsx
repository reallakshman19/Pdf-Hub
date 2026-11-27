import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalloutNode } from '../CalloutNode';
import type { PdfAnnotation } from '@/core/annotations/types';

describe('OnBoard-IR: CalloutNode Multi-Leader & Landing Shelf UI Falsifiers (Mini-Phase N.2)', () => {
  const defaultHandlers = {
    onSelect: vi.fn(),
    onTransformStart: vi.fn(),
    onDoubleClick: vi.fn(),
    onCommitEdit: vi.fn(),
  };

  // ── FALSIFY-UI-01: Multi-leader SVG renders exact polyline count and landing shelf ──
  it('FALSIFY-UI-01: renders horizontal landing shelf line and 2 polylines per leader branch', () => {
    const annotation: PdfAnnotation & { type: 'callout' } = {
      id: 'callout-cad-1',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 200, y: 150, width: 100, height: 40 },
      data: {
        text: 'WELD 101',
        shelfStyle: 'underline',
        shelfLength: 20,
        leaders: [
          { id: 'leader-a', anchor: { x: 50, y: 120 }, arrowHead: 'open' },
          { id: 'leader-b', anchor: { x: 60, y: 220 }, arrowHead: 'filled' },
          { id: 'leader-c', anchor: { x: 380, y: 180 }, arrowHead: 'circle' },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <CalloutNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        {...defaultHandlers}
      />,
    );

    // 1. Landing shelf line exists
    const shelf = screen.getByTestId('callout-landing-shelf');
    expect(shelf).toBeInTheDocument();
    // Strictly horizontal: y1 === y2
    expect(shelf.getAttribute('y1')).toBe(shelf.getAttribute('y2'));
    // Bottom baseline of box: y = 150 + 40 = 190
    expect(shelf.getAttribute('y1')).toBe('190');

    // 2. 3 branches * (1 hit target + 1 visible stroke) = 6 polylines
    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBe(6);
  });

  // ── FALSIFY-UI-02: Knee drag handles render at exact coordinates and fire drag callbacks ──
  it('FALSIFY-UI-02: renders draggable knee handles for each branch and dispatches drag events', () => {
    const onLeaderKneeDragStart = vi.fn();
    const onKneeDragStart = vi.fn();

    const annotation: PdfAnnotation & { type: 'callout' } = {
      id: 'callout-knee-multi',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 200, y: 100, width: 120, height: 40 },
      data: {
        text: 'Detail View',
        shelfStyle: 'underline',
        shelfLength: 16,
        leaders: [
          { id: 'branch-1', anchor: { x: 50, y: 50 }, knee: { x: 120, y: 80 } },
          { id: 'branch-2', anchor: { x: 40, y: 220 }, knee: { x: 110, y: 180 } },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    };

    render(
      <CalloutNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        onLeaderKneeDragStart={onLeaderKneeDragStart}
        onKneeDragStart={onKneeDragStart}
        {...defaultHandlers}
      />,
    );

    const kneeHandles = screen.getAllByTestId('callout-knee-handle');
    expect(kneeHandles.length).toBe(2);

    // First knee at x=120, y=80
    expect(kneeHandles[0].getAttribute('cx')).toBe('120');
    expect(kneeHandles[0].getAttribute('cy')).toBe('80');
    expect(kneeHandles[0].getAttribute('data-leader-id')).toBe('branch-1');

    // Second knee at x=110, y=180
    expect(kneeHandles[1].getAttribute('cx')).toBe('110');
    expect(kneeHandles[1].getAttribute('cy')).toBe('180');
    expect(kneeHandles[1].getAttribute('data-leader-id')).toBe('branch-2');

    // Fire drag event on second knee
    fireEvent.pointerDown(kneeHandles[1]);
    expect(onLeaderKneeDragStart).toHaveBeenCalledWith('branch-2', expect.anything());
  });

  // ── FALSIFY-UI-03: Arrowheads render with correct styling and anchor handle drag events ──
  it('FALSIFY-UI-03: renders arrowheads matching style types and fires anchor drag events', () => {
    const onLeaderAnchorDragStart = vi.fn();

    const annotation: PdfAnnotation & { type: 'callout' } = {
      id: 'callout-arrows',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 150, y: 150, width: 100, height: 30 },
      data: {
        text: 'Valve Tag',
        shelfStyle: 'midpoint',
        shelfLength: 15,
        leaders: [
          { id: 'arr-filled', anchor: { x: 300, y: 100 }, arrowHead: 'filled' },
          { id: 'arr-circle', anchor: { x: 300, y: 200 }, arrowHead: 'circle' },
        ],
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <CalloutNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={true}
        onLeaderAnchorDragStart={onLeaderAnchorDragStart}
        {...defaultHandlers}
      />,
    );

    // Filled arrow renders as polygon
    const polygon = container.querySelector('polygon');
    expect(polygon).toBeInTheDocument();

    // Circle arrow renders as circle
    const circles = container.querySelectorAll('circle');
    // 2 anchor handles + 1 circle arrowhead
    expect(circles.length).toBeGreaterThanOrEqual(3);

    const anchorHandles = screen.getAllByTestId('callout-anchor-handle');
    expect(anchorHandles.length).toBe(2);

    fireEvent.pointerDown(anchorHandles[0]);
    expect(onLeaderAnchorDragStart).toHaveBeenCalledWith('arr-filled', expect.anything());
  });

  // ── FALSIFY-UI-04: Seamless backwards compatibility with legacy single-anchor callouts ──
  it('FALSIFY-UI-04: preserves exact backwards compatibility for legacy callouts without shelf', () => {
    const onKneeDragStart = vi.fn();
    const onAnchorDragStart = vi.fn();

    const legacyAnnotation: PdfAnnotation & { type: 'callout' } = {
      id: 'legacy-callout',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 80, height: 40 },
      data: {
        text: 'Legacy Note',
        anchor: { x: 260, y: 160 },
        knee: { x: 260, y: 120 },
        leaderStyle: 'elbow',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <CalloutNode
        annotation={legacyAnnotation}
        rect={legacyAnnotation.rect}
        scale={1}
        isSelected={true}
        anchorPoint={legacyAnnotation.data.anchor}
        kneePoint={legacyAnnotation.data.knee}
        onAnchorDragStart={onAnchorDragStart}
        onKneeDragStart={onKneeDragStart}
        {...defaultHandlers}
      />,
    );

    // Shelf should NOT be rendered when shelfStyle is not set
    const shelf = screen.queryByTestId('callout-landing-shelf');
    expect(shelf).toBeNull();

    // Exactly 2 polylines (1 hit target + 1 visible line)
    const polylines = container.querySelectorAll('polyline');
    expect(polylines.length).toBe(2);

    // Single knee handle and single anchor handle
    const kneeHandle = screen.getByTestId('callout-knee-handle');
    expect(kneeHandle).toBeInTheDocument();
    expect(kneeHandle.getAttribute('cx')).toBe('260');
    expect(kneeHandle.getAttribute('cy')).toBe('120');

    fireEvent.pointerDown(kneeHandle);
    expect(onKneeDragStart).toHaveBeenCalledTimes(1);

    const anchorHandle = screen.getByTestId('callout-anchor-handle');
    expect(anchorHandle).toBeInTheDocument();
    expect(anchorHandle.getAttribute('cx')).toBe('260');
    expect(anchorHandle.getAttribute('cy')).toBe('160');

    fireEvent.pointerDown(anchorHandle);
    expect(onAnchorDragStart).toHaveBeenCalledTimes(1);
  });
});
