import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

vi.mock('./RedactionInspectorTab', () => ({
  RedactionInspectorTab: () => (
    <div data-testid="redaction-tab-content">
      Secure Redaction Content
    </div>
  ),
}));

describe('InspectorPanel redaction tab', () => {
  beforeEach(() => {
    useEditorStore.setState({
      inspectorTab: 'properties',
      rightPanelWidth: 18,
      activeMode: 'annotate',
    });
  });

  it('switches to Redaction tab without requiring annotation selection', () => {
    render(<InspectorPanel />);

    const redactionTabBtn = screen.getByTitle('Redaction');
    expect(redactionTabBtn).toBeInTheDocument();

    fireEvent.click(redactionTabBtn);

    expect(useEditorStore.getState().inspectorTab).toBe('redaction');
    expect(screen.getByText('Secure Content Redaction')).toBeInTheDocument();
    expect(screen.getByTestId('redaction-tab-content')).toBeInTheDocument();
    expect(screen.queryByText('No selection')).toBeNull();
  });
});
