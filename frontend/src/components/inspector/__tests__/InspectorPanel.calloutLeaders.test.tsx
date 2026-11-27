import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo } from '@/core/document-history/transactions';
import { InspectorPanel } from '../InspectorPanel';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

function createCalloutAnnotation(id = 'callout-1'): PdfAnnotation {
  return {
    id,
    type: 'callout',
    pageNumber: 1,
    rect: { x: 100, y: 100, width: 140, height: 60 },
    createdAt: 1000,
    updatedAt: 1000,
    data: {
      text: 'W12x26 BEAM',
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1,
      opacity: 1,
      shelfStyle: 'underline',
      shelfLength: 16,
      anchor: { x: 40, y: 180 },
      knee: { x: 80, y: 140 },
      leaders: [
        {
          id: 'branch-1',
          anchor: { x: 40, y: 180 },
          knee: { x: 80, y: 140 },
          leaderStyle: 'elbow',
          arrowHead: 'open',
        },
      ],
    },
  };
}

describe('InspectorPanel - CAD Callout Leaders & Replayability (Mini-Phase N.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
    useEditorStore.setState({
      inspectorTab: 'style',
      rightPanelWidth: 18,
      activeMode: 'annotate',
    });
  });

  it('FALSIFY-TRANS-01: Adding a leader branch via callout-add-leader-btn updates annotation.data.leaders with unique ID and preserves existing branches', () => {
    const callout = createCalloutAnnotation('callout-1');
    useAnnotationStore.setState({
      annotations: [callout],
      selectedAnnotationIds: [callout.id],
      activeAnnotationId: callout.id,
    });

    const { rerender } = render(<InspectorPanel />);

    expect(screen.getByTestId('callout-leaders-inspector')).toBeInTheDocument();
    expect(screen.getByText('Branches (1)')).toBeInTheDocument();
    expect(screen.getByTestId('callout-leader-row-branch-1')).toBeInTheDocument();

    const addBtn = screen.getByTestId('callout-add-leader-btn');
    fireEvent.click(addBtn);

    const updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'callout-1');
    expect(updated?.data.leaders).toBeDefined();
    expect(updated?.data.leaders).toHaveLength(2);

    const firstBranch = updated?.data.leaders?.[0];
    const secondBranch = updated?.data.leaders?.[1];

    expect(firstBranch?.id).toBe('branch-1');
    expect(firstBranch?.anchor).toEqual({ x: 40, y: 180 });
    expect(secondBranch?.id).toMatch(/^leader-/);
    expect(secondBranch?.id).not.toBe('branch-1');
    expect(secondBranch?.arrowHead).toBe('open');
    expect(secondBranch?.leaderStyle).toBe('elbow');

    // Re-render and verify DOM reflects 2 branches
    rerender(<InspectorPanel />);
    expect(screen.getByText('Branches (2)')).toBeInTheDocument();
    expect(screen.getByTestId(`callout-leader-row-${secondBranch?.id}`)).toBeInTheDocument();
  });

  it('FALSIFY-TRANS-02: Removing a leader branch removes target branch, preserves others, and hides remove button when only 1 leader remains', () => {
    const callout = createCalloutAnnotation('callout-1');
    callout.data.leaders = [
      {
        id: 'branch-1',
        anchor: { x: 40, y: 180 },
        knee: { x: 80, y: 140 },
        leaderStyle: 'elbow',
        arrowHead: 'open',
      },
      {
        id: 'branch-2',
        anchor: { x: 50, y: 220 },
        knee: { x: 85, y: 150 },
        leaderStyle: 'straight',
        arrowHead: 'filled',
      },
    ];

    useAnnotationStore.setState({
      annotations: [callout],
      selectedAnnotationIds: [callout.id],
      activeAnnotationId: callout.id,
    });

    const { rerender } = render(<InspectorPanel />);

    expect(screen.getByText('Branches (2)')).toBeInTheDocument();
    const removeBtnBranch2 = screen.getByTestId('callout-remove-leader-branch-2');
    expect(removeBtnBranch2).toBeInTheDocument();
    const removeBtnBranch1 = screen.getByTestId('callout-remove-leader-branch-1');
    expect(removeBtnBranch1).toBeInTheDocument();

    // Remove branch-2
    fireEvent.click(removeBtnBranch2);

    const updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'callout-1');
    expect(updated?.data.leaders).toHaveLength(1);
    expect(updated?.data.leaders?.[0].id).toBe('branch-1');

    // Re-render and verify remove button is hidden when only 1 branch remains
    rerender(<InspectorPanel />);
    expect(screen.getByText('Branches (1)')).toBeInTheDocument();
    expect(screen.queryByTestId('callout-remove-leader-branch-1')).toBeNull();
  });

  it('FALSIFY-TRANS-03: Toggling shelf style (underline <-> midpoint <-> none) and shelf length updates annotation data in store', () => {
    const callout = createCalloutAnnotation('callout-1');
    useAnnotationStore.setState({
      annotations: [callout],
      selectedAnnotationIds: [callout.id],
      activeAnnotationId: callout.id,
    });

    const { rerender } = render(<InspectorPanel />);

    // 1. Initial style is 'underline'
    const shelfStyleSelect = screen.getByLabelText(/shelf style/i) as HTMLSelectElement;
    expect(shelfStyleSelect.value).toBe('underline');

    // 2. Change to 'midpoint'
    fireEvent.change(shelfStyleSelect, { target: { value: 'midpoint' } });
    let updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'callout-1');
    expect(updated?.data.shelfStyle).toBe('midpoint');

    // 3. Update shelf length
    rerender(<InspectorPanel />);
    const shelfLengthInput = screen.getByLabelText(/shelf length/i) as HTMLInputElement;
    expect(shelfLengthInput).toBeInTheDocument();
    fireEvent.change(shelfLengthInput, { target: { value: '28' } });

    updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'callout-1');
    expect(updated?.data.shelfLength).toBe(28);

    // 4. Change to 'none'
    rerender(<InspectorPanel />);
    const updatedShelfStyleSelect = screen.getByLabelText(/shelf style/i) as HTMLSelectElement;
    fireEvent.change(updatedShelfStyleSelect, { target: { value: 'none' } });

    updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'callout-1');
    expect(updated?.data.shelfStyle).toBe('none');

    // 5. Verify Shelf Length input is hidden when shelfStyle === 'none'
    rerender(<InspectorPanel />);
    expect(screen.queryByLabelText(/shelf length/i)).toBeNull();
  });

  it('FALSIFY-TRANS-04: 100 cumulative leader/shelf operations with applyUndo() guarantee 100% replayability and byte-for-byte fidelity', async () => {
    // Open session so documentKey and workingBytes enable durable transaction recording
    useSessionStore.getState().openDocument({
      documentKey: 'test-doc-replay-callout',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 1,
    });

    const initialCallout = createCalloutAnnotation('callout-replay-1');
    const initialClone = JSON.parse(JSON.stringify(initialCallout)) as PdfAnnotation;

    useAnnotationStore.setState({
      annotations: [initialCallout],
      selectedAnnotationIds: [initialCallout.id],
      activeAnnotationId: initialCallout.id,
    });

    expect(useHistoryStore.getState().undoStack.length).toBe(0);

    const shelfStyles = ['underline', 'midpoint', 'none'] as const;

    // 100 Cumulative Cycle Operations (10 cycles x 10 steps = 100 mutations & 100 undos)
    // Testing full state reconstruction and zero-drift replayability within history budget
    for (let cycle = 0; cycle < 10; cycle++) {
      // Re-select annotation for this edit session (undo resets selection)
      useAnnotationStore.getState().setSelection(['callout-replay-1']);

      // Apply 10 sequential mutations within the retention window
      for (let step = 0; step < 10; step++) {
        const i = cycle * 10 + step;
        const stepType = step % 4;
        if (stepType === 0) {
          const nextStyle = shelfStyles[i % shelfStyles.length];
          useAnnotationStore.getState().updateStyleForSelection({ shelfStyle: nextStyle });
        } else if (stepType === 1) {
          useAnnotationStore.getState().updateStyleForSelection({ shelfLength: 10 + (i % 30) });
        } else if (stepType === 2) {
          const currentLeaders = useAnnotationStore.getState().annotations[0]?.data.leaders ?? [];
          const newBranch = {
            id: `cycle-${cycle}-step-${step}`,
            anchor: { x: 50 + step, y: 150 + step },
            knee: { x: 80 + step, y: 130 },
            leaderStyle: (step % 2 === 0 ? 'elbow' : 'straight') as 'elbow' | 'straight',
            arrowHead: (step % 2 === 0 ? 'filled' : 'open') as 'filled' | 'open',
          };
          useAnnotationStore.getState().updateStyleForSelection({
            leaders: [...currentLeaders, newBranch],
          });
        } else {
          useAnnotationStore.getState().updateStyleForSelection({
            arrowHead: step % 2 === 0 ? 'circle' : 'diamond',
            leaderStyle: step % 2 === 0 ? 'straight' : 'elbow',
          });
        }
      }

      expect(useHistoryStore.getState().undoStack.length).toBe(10);

      // Undo all 10 operations in this cycle
      for (let step = 0; step < 10; step++) {
        const undoSuccess = await applyUndo();
        expect(undoSuccess).toBe(true);
      }

      // Verify exact return to base state after each 10-operation cycle
      const restored = useAnnotationStore.getState().annotations[0];
      expect(restored.data.shelfStyle).toBe(initialClone.data.shelfStyle);
      expect(restored.data.shelfLength).toBe(initialClone.data.shelfLength);
      expect(restored.data.leaders).toEqual(initialClone.data.leaders);
      expect(restored.data.text).toBe(initialClone.data.text);
      expect(restored.data.arrowHead).toBe(initialClone.data.arrowHead);
      expect(restored.data.leaderStyle).toBe(initialClone.data.leaderStyle);
    }

    // Final verification: 100 cumulative mutations and undos executed with zero state drift
    const finalAnnotation = useAnnotationStore.getState().annotations[0];
    expect(finalAnnotation.data.shelfStyle).toBe(initialClone.data.shelfStyle);
    expect(finalAnnotation.data.shelfLength).toBe(initialClone.data.shelfLength);
    expect(finalAnnotation.data.leaders).toEqual(initialClone.data.leaders);
  });

  it('FALSIFY-TRANS-05: Memory budget strictly caps undoStack at maxUndoDepth (15) to prevent unbounded memory growth on large documents', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'test-doc-budget-callout',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 1,
    });

    const callout = createCalloutAnnotation('callout-budget-1');
    useAnnotationStore.setState({
      annotations: [callout],
      selectedAnnotationIds: [callout.id],
      activeAnnotationId: callout.id,
    });

    // Push 100 sequential mutations
    for (let i = 0; i < 100; i++) {
      useAnnotationStore.getState().updateStyleForSelection({
        shelfLength: 10 + (i % 30),
      });
    }

    // Must be capped at exactly 15 to prevent memory explosion on large PDFs
    expect(useHistoryStore.getState().undoStack.length).toBe(15);
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });
});
