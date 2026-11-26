import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InspectorPanel } from './InspectorPanel';
import { useEditorStore } from '@/core/editor/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useAnnotationStore } from '@/core/annotations/store';
import { clearRegions } from '@/core/redaction/store';

describe('InspectorPanel Writer V2 integration', () => {
  beforeEach(() => {
    clearRegions();
    useAnnotationStore.setState({
      annotations: [],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    });
    useEditorStore.setState({
      activeMode: 'write',
      inspectorTab: 'properties',
      rightPanelWidth: 20,
    });
    useWriterV2Store.getState().clearWriterV2();
  });

  it('embeds WriterV2Inspector when a Writer V2 element is selected and keeps Redaction tab clickable', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'inspector-v2-doc',
      elements: [{
        id: 'v2-box-1',
        documentFingerprint: 'inspector-v2-doc',
        pageIndex: 0,
        type: 'richTextBox',
        rect: { x: 20, y: 30, width: 140, height: 48 },
        plainText: 'Sample block',
        style: {
          zIndex: 1,
          backgroundColor: '#ffffff',
          borderColor: '#2563eb',
          borderWidth: 1,
          padding: 8,
          opacity: 1,
          fontSize: 12,
          fontFamily: 'Inter',
          textColor: '#0f172a',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        locked: false,
        hidden: false,
      }],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['v2-box-1'],
    });

    render(<InspectorPanel />);

    expect(screen.getByText('Write Studio Element')).toBeInTheDocument();
    expect(screen.getByLabelText('Writer V2 inspector')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Redaction'));
    expect(screen.getByText('Secure Redaction')).toBeInTheDocument();
  });
});
