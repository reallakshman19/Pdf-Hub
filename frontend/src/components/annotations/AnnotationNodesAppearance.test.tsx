import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { CalloutNode } from './CalloutNode';
import { TextboxNode } from './TextboxNode';
import { CommentNode } from './CommentNode';
import { ShapeCloudNode } from './ShapeCloudNode';
import { StampNode } from './StampNode';

const callbacks = () => ({
  onSelect: vi.fn(),
  onTransformStart: vi.fn(),
  onDoubleClick: vi.fn(),
  onCommitEdit: vi.fn(),
});

describe('AnnotationNodes translucency and transparent background', () => {
  it('CalloutNode renders with translucent opacity and transparent background', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation = {
      id: 'callout-trans',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 120, height: 40 },
      data: {
        text: 'Callout text',
        opacity: 0.5,
        backgroundColor: 'transparent',
        borderColor: '#2563eb',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container } = render(
      <CalloutNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        {...handlers}
      />,
    );

    const root = container.querySelector('[data-annotation-container="callout"]') as HTMLDivElement;
    expect(root).toBeTruthy();
    expect(root.style.opacity).toBe('0.5');

    const box = container.querySelector('[data-annotation-type="callout"]') as HTMLDivElement;
    expect(box.style.background).toBe('transparent');
  });

  it('CalloutNode editor hides scrollbars and commits on Enter', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation = {
      id: 'callout-edit',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 120, height: 40 },
      data: { text: 'Note' },
      createdAt: 1,
      updatedAt: 1,
    };

    render(
      <CalloutNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected
        isEditing
        editingValue="Initial"
        {...handlers}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.style.overflow).toBe('hidden');
    expect(textarea.style.resize).toBe('none');
    expect(textarea.style.scrollbarWidth).toBe('none');

    fireEvent.change(textarea, { target: { value: 'Committed' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(handlers.onCommitEdit).toHaveBeenCalledWith('Committed');
  });

  it('TextboxNode renders translucent, respects transparent background, and provides polished editor', () => {
    const handlers = callbacks();
    const annotation: PdfAnnotation = {
      id: 'textbox-trans',
      type: 'textbox',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 100, height: 30 },
      data: {
        text: 'Text',
        opacity: 0.25,
        backgroundColor: 'transparent',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const { container, rerender } = render(
      <TextboxNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected={false}
        {...handlers}
      />,
    );

    const root = container.querySelector('[data-annotation-type="textbox"]') as HTMLDivElement;
    expect(root.style.opacity).toBe('0.25');
    expect(root.style.background).toBe('transparent');

    // Rerender in edit mode
    rerender(
      <TextboxNode
        annotation={annotation}
        rect={annotation.rect}
        scale={1}
        isSelected
        isEditing
        editingValue="Rest"
        {...handlers}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.style.overflow).toBe('hidden');
    expect(textarea.style.resize).toBe('none');
    expect(textarea.style.scrollbarWidth).toBe('none');

    fireEvent.change(textarea, { target: { value: 'Rest 2200' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(handlers.onCommitEdit).toHaveBeenCalledWith('Rest 2200');
  });

  it('CommentNode, ShapeCloudNode, and StampNode apply opacity and transparent background correctly', () => {
    const handlers = callbacks();
    const comment: PdfAnnotation = {
      id: 'comment-1',
      type: 'comment',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 50, height: 30 },
      data: { opacity: 0.6, backgroundColor: 'transparent' },
      createdAt: 1,
      updatedAt: 1,
    };
    const { container: commentContainer } = render(
      <CommentNode annotation={comment} rect={comment.rect} scale={1} isSelected={false} {...handlers} />,
    );
    const commentEl = commentContainer.querySelector('[data-annotation-type="comment"]') as HTMLDivElement;
    expect(commentEl.style.opacity).toBe('0.6');
    expect(commentEl.style.background).toBe('transparent');

    const cloud: PdfAnnotation = {
      id: 'cloud-1',
      type: 'shape-cloud',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 80, height: 60 },
      data: { opacity: 0.4 },
      createdAt: 1,
      updatedAt: 1,
    };
    const { container: cloudContainer } = render(
      <ShapeCloudNode annotation={cloud} rect={cloud.rect} scale={1} isSelected={false} {...handlers} />,
    );
    const cloudEl = cloudContainer.querySelector('[data-annotation-type="shape-cloud"]') as HTMLDivElement;
    expect(cloudEl.style.opacity).toBe('0.4');

    const stamp: PdfAnnotation = {
      id: 'stamp-1',
      type: 'stamp',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 80, height: 40 },
      data: { opacity: 0.5, backgroundColor: 'transparent', text: 'APPROVED' },
      createdAt: 1,
      updatedAt: 1,
    };
    const { container: stampContainer } = render(
      <StampNode annotation={stamp} rect={stamp.rect} scale={1} isSelected={false} {...handlers} />,
    );
    const stampEl = stampContainer.querySelector('[data-annotation-type="stamp"]') as HTMLDivElement;
    expect(stampEl.style.opacity).toBe('0.5');
    expect(stampEl.style.background).toBe('transparent');
  });
});
