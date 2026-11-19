import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StampNode } from './StampNode';

describe('generated stamp preview orientation', () => {
  it('starts upright on its basis page and turns with later page rotations and copies', () => {
    const annotation = { id: 'stamp', type: 'stamp' as const, pageNumber: 1,
      rect: { x: 10, y: 20, width: 80, height: 30 },
      data: { text: 'APPROVED', nativeStampAppearanceKind: 'generated' as const, nativeStampBasisRotation: 90 },
      createdAt: 1, updatedAt: 1 };
    const callbacks = { onSelect: vi.fn(), onTransformStart: vi.fn() };
    const { container, rerender } = render(<StampNode annotation={annotation} rect={annotation.rect}
      scale={1} isSelected={false} pageRotation={90} {...callbacks} />);
    const stamp = container.querySelector('[data-annotation-type="stamp"]') as HTMLElement;
    expect(stamp.style.transform).toBe('rotate(0deg)');
    expect(stamp.style.width).toBe('80px');
    expect(stamp.style.height).toBe('30px');

    const rotatedRect = { x: 20, y: 30, width: 30, height: 80 };
    rerender(<StampNode annotation={{ ...annotation, rect: rotatedRect }} rect={rotatedRect}
      scale={1} isSelected={false} pageRotation={180} {...callbacks} />);
    expect(stamp.style.transform).toBe('rotate(90deg)');
    expect(stamp.style.width).toBe('80px');
    expect(stamp.style.height).toBe('30px');

    const copied = { ...annotation, pageNumber: 2, rect: rotatedRect,
      data: { ...annotation.data, nativeStampBasisRotation: 270, nativeCopySource: { pageNumber: 1, nativeName: 'stamp' } } };
    rerender(<StampNode annotation={copied} rect={rotatedRect}
      scale={1} isSelected={false} pageRotation={0} {...callbacks} />);
    expect(stamp.style.transform).toBe('rotate(90deg)');
    expect(stamp.style.width).toBe('80px');
    expect(stamp.style.height).toBe('30px');
  });
});
