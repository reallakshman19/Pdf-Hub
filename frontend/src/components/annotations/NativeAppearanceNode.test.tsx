import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { NativeAppearanceNode } from './NativeAppearanceNode';

const callout: PdfAnnotation = {
  id: 'foreign-callout',
  type: 'callout',
  pageNumber: 1,
  rect: { x: 50, y: 260, width: 120, height: 40 },
  data: {
    text: 'Engineering callout',
    nativeAppearanceImported: true,
    nativeAppearanceRef: '10R',
    nativeAppearanceRect: { x: 20, y: 260, width: 150, height: 40 },
    nativeAppearanceBodyRect: { x: 50, y: 260, width: 120, height: 40 },
    anchor: { x: 20, y: 280 },
    leaderStyle: 'straight',
  },
  createdAt: 1,
  updatedAt: 1,
};

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
  onAnchorDragStart: vi.fn(),
});

describe('native appearance visual with interactive overlay', () => {
  it('positions full /AP without shrinking a callout leader to the body rect', () => {
    const handlers = callbacks();
    const { container } = render(
      <NativeAppearanceNode annotation={callout} rect={callout.rect} scale={1}
        nativeAppearanceUrl="data:image/png;base64,ZmFrZQ==" isSelected={false} {...handlers} />,
    );
    const image = container.querySelector('[data-native-annotation-appearance]') as HTMLImageElement;
    const body = container.querySelector('[data-native-annotation-hit-target]') as HTMLDivElement;
    const accessibleText = screen.getByText('Engineering callout');
    expect(accessibleText).toHaveAttribute('data-native-annotation-text');
    expect(accessibleText).toHaveStyle({ opacity: '0' });
    fireEvent.doubleClick(accessibleText);
    expect(handlers.onDoubleClick).toHaveBeenCalledOnce();
    expect(image).toBeTruthy();
    const root = container.querySelector('[data-native-annotation-id="foreign-callout"]') as HTMLDivElement;
    expect(root.style.left).toBe('50px');
    expect(root.style.top).toBe('260px');
    expect(image.style.left).toBe('-30px');
    expect(image.style.top).toBe('0px');
    expect(image.style.width).toBe('150px');
    // Tailwind's img { max-width: 100% } must never shrink a full /Rect
    // preview into the narrower /RD text body.
    expect(image.style.maxWidth).toBe('none');
    expect(image.style.maxHeight).toBe('none');
    expect(body.style.left).toBe('0px');
    expect(body.style.width).toBe('100%');
    expect(image.style.pointerEvents).toBe('none');

    fireEvent.pointerDown(body);
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
    expect(handlers.onTransformStart).toHaveBeenCalledWith(expect.anything(), 'move');

    fireEvent.doubleClick(body);
    expect(handlers.onDoubleClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the visible AP aligned when an unmodified annotation is translated', () => {
    const handlers = callbacks();
    const rect = { ...callout.rect, x: 70, y: 275 };
    const { container } = render(
      <NativeAppearanceNode annotation={callout} rect={rect} scale={1}
        nativeAppearanceUrl="data:image/png;base64,ZmFrZQ==" isSelected={false} {...handlers} />,
    );
    const image = container.querySelector('[data-native-annotation-appearance]') as HTMLImageElement;
    const root = container.querySelector('[data-native-annotation-id="foreign-callout"]') as HTMLDivElement;
    expect(root.style.left).toBe('70px');
    expect(root.style.top).toBe('275px');
    expect(image.style.left).toBe('-30px');
    expect(image.style.top).toBe('0px');
  });

  it('shows selection handles and anchor editing independently of the artwork', () => {
    const handlers = callbacks();
    const { container } = render(
      <NativeAppearanceNode annotation={callout} rect={callout.rect} scale={1}
        nativeAppearanceUrl="data:image/png;base64,ZmFrZQ==" isSelected
        anchorPoint={{ x: 20, y: 280 }} {...handlers} />,
    );
    const anchor = container.querySelector('circle') as SVGCircleElement;
    expect(anchor).toBeTruthy();
    fireEvent.pointerDown(anchor);
    expect(handlers.onAnchorDragStart).toHaveBeenCalledOnce();

    const resize = container.querySelector('.cursor-se-resize') as HTMLElement;
    expect(resize).toBeTruthy();
    fireEvent.pointerDown(resize);
    expect(handlers.onTransformStart).toHaveBeenCalledWith(expect.anything(), 'resize');
  });

  it('hides stale artwork while editing FreeText and commits typed text', () => {
    const handlers = callbacks();
    const { container } = render(
      <NativeAppearanceNode annotation={callout} rect={callout.rect} scale={1}
        nativeAppearanceUrl="data:image/png;base64,ZmFrZQ==" isSelected
        isEditing editingValue="old text" {...handlers} />,
    );
    expect(container.querySelector('[data-native-annotation-appearance]')).toBeNull();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'changed text' } });
    fireEvent.blur(input);
    expect(handlers.onCommitEdit).toHaveBeenCalledWith('changed text');
  });
});
