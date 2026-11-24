import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { StickyNoteNode } from './StickyNoteNode';
import { CommentNode } from './CommentNode';
import { resolvePdfNoteIconName } from './shared/PdfNoteIcon';

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
});

function note<T extends 'sticky-note' | 'comment'>(
  type: T,
  data: PdfAnnotation['data'],
): PdfAnnotation & { type: T } {
  return {
    id: `${type}-1`,
    type,
    pageNumber: 1,
    rect: { x: 40, y: 60, width: 20, height: 20 },
    data: { text: 'UDEFM57/HUM', author: 'Humaid A', ...data },
    createdAt: 1,
    updatedAt: 1,
  } as PdfAnnotation & { type: T };
}

describe('native PDF note icon fidelity', () => {
  it('renders a collapsed imported sticky note as its /Name icon in its /C colour', () => {
    const annotation = note('sticky-note', { noteIcon: 'Comment', borderColor: '#8c40f2' });
    const { container } = render(
      <StickyNoteNode annotation={annotation} rect={annotation.rect} scale={1} isSelected={false} {...callbacks()} />,
    );
    const icon = container.querySelector('svg[data-note-icon="Comment"]');
    expect(icon).not.toBeNull();
    expect(icon?.querySelector('rect')?.getAttribute('fill')).toBe('#8c40f2');
    expect(container.textContent).not.toContain('UDEFM57/HUM');
    expect(container.firstElementChild?.getAttribute('title')).toBe('Humaid A: UDEFM57/HUM');
  });

  it('keeps the post-it look for in-app sticky notes', () => {
    const annotation = note('sticky-note', {});
    const { container } = render(
      <StickyNoteNode annotation={annotation} rect={annotation.rect} scale={1} isSelected={false} {...callbacks()} />,
    );
    expect(container.querySelector('svg[data-note-icon]')).toBeNull();
    expect(container.textContent).toContain('UDEFM57/HUM');
  });

  it('renders a closed imported comment as an icon and an editor when editing', () => {
    const annotation = note('comment', { noteIcon: 'Note', isCollapsed: true });
    const props = { annotation, rect: annotation.rect, scale: 1, isSelected: false, ...callbacks() };
    const { container, rerender } = render(<CommentNode {...props} />);
    expect(container.querySelector('svg[data-note-icon="Note"]')).not.toBeNull();

    rerender(<CommentNode {...props} isEditing editingValue="UDEFM57/HUM" />);
    expect(container.querySelector('svg[data-note-icon]')).toBeNull();
    const box = container.firstElementChild as HTMLElement;
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(220);
  });

  it('falls back to the Note icon for unknown names', () => {
    expect(resolvePdfNoteIconName('Comment')).toBe('Comment');
    expect(resolvePdfNoteIconName('Checkmark')).toBe('Note');
    expect(resolvePdfNoteIconName(undefined)).toBe('Note');
  });
});
