import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CommentsSidebar } from '../CommentsSidebar';
import { useAnnotationStore } from '@/core/annotations/store';
import { useReviewStore } from '@/core/review/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';

function annotation(
  id: string,
  type: PdfAnnotation['type'],
  text: string,
  review?: PdfAnnotation['data']['review'],
): PdfAnnotation {
  return {
    id,
    type,
    pageNumber: 2,
    rect: { x: 10, y: 20, width: 100, height: 40 },
    data: {
      text,
      ...(review ? { review } : {}),
    },
    createdAt: 100,
    updatedAt: 200,
  };
}

describe('CommentsSidebar', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      annotations: [],
      history: [],
      future: [],
      activeAnnotationId: null,
      selectedAnnotationIds: [],
      clipboard: [],
    });
    useReviewStore.setState({
      hideResolved: false,
      filterStatus: 'all',
    });
    useSessionStore.setState((state) => ({
      ...state,
      viewState: {
        ...state.viewState,
        currentPage: 1,
      },
    }));
  });

  it('shows conversations rather than every annotation and supports reply + resolve inline', () => {
    useAnnotationStore.getState().setAnnotations([
      annotation('plain-highlight', 'highlight', 'Markup only'),
      annotation('thread-1', 'comment', 'Check flange rating'),
    ]);

    render(<CommentsSidebar />);

    expect(screen.getByText('Check flange rating')).toBeTruthy();
    expect(screen.queryByText('Markup only')).toBeNull();

    fireEvent.click(screen.getByText('Check flange rating'));

    const replyInput = screen.getByRole('textbox', { name: 'Reply to this thread' });
    fireEvent.change(replyInput, { target: { value: 'Use Class 300.' } });
    fireEvent.click(screen.getByTitle('Send reply'));

    let thread = useAnnotationStore.getState().annotations.find((item) => item.id === 'thread-1');
    expect(thread?.data.review?.replies[0]?.content).toBe('Use Class 300.');

    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    thread = useAnnotationStore.getState().annotations.find((item) => item.id === 'thread-1');
    expect(thread?.data.review?.status).toBe('resolved');
  });

  it('includes non-comment markup when it has an explicit review conversation', () => {
    useAnnotationStore.getState().setAnnotations([
      annotation('reviewed-highlight', 'highlight', 'Pump tag', {
        author: 'Reviewer',
        createdAt: 100,
        updatedAt: 200,
        status: 'open',
        replies: [],
      }),
    ]);

    render(<CommentsSidebar />);

    expect(screen.getByText('Pump tag')).toBeTruthy();
    expect(screen.getByText(/Reviewer · open/i)).toBeTruthy();
  });
});
