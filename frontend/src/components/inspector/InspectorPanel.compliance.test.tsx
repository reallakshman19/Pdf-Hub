import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

vi.mock('./ComplianceInspectorTab', () => ({
  ComplianceInspectorTab: () => (
    <div data-testid="compliance-tab-content">
      PDF/A Archival Preflight Content
    </div>
  ),
}));

describe('InspectorPanel compliance tab', () => {
  beforeEach(() => {
    useEditorStore.setState({
      inspectorTab: 'properties',
      rightPanelWidth: 18,
      activeMode: 'file',
    });
  });

  it('switches to PDF/A & Compliance tab without requiring annotation selection', () => {
    render(<InspectorPanel />);

    const tabBtn = screen.getByTitle('PDF/A & Compliance');
    expect(tabBtn).toBeInTheDocument();

    fireEvent.click(tabBtn);

    expect(useEditorStore.getState().inspectorTab).toBe('compliance');
    expect(screen.getByText('ISO 19005 PDF/A Archival Preflight')).toBeInTheDocument();
    expect(screen.getByTestId('compliance-tab-content')).toBeInTheDocument();
    expect(screen.queryByText('No selection')).toBeNull();
  });
});
