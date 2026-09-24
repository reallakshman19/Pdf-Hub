import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

vi.mock(
  './ExistingTextInspectorTab',
  () => ({
    ExistingTextInspectorTab:
      () => (
        <div data-testid="existing-text-tab-content">
          PDF text content
        </div>
      ),
  }),
);

describe('InspectorPanel existing-text tab', () => {
  beforeEach(() => {
    useEditorStore.setState({
      inspectorTab:
        'properties',
      rightPanelWidth: 18,
      activeMode: 'annotate',
    });
  });

  it('opens PDF text without requiring annotation selection', () => {
    render(<InspectorPanel />);

    fireEvent.click(
      screen.getByTitle(
        'PDF text',
      ),
    );

    expect(
      useEditorStore.getState()
        .inspectorTab,
    ).toBe('text');
    expect(
      screen.getByTestId(
        'existing-text-tab-content',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Select an annotation to edit it.',
      ),
    ).not.toBeInTheDocument();
  });
});
