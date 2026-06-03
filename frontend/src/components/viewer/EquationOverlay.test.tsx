import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EquationOverlay from './EquationOverlay';
import { OcrStore } from '../../core/ocr/store';
import type { OcrResultsByPage } from '../../core/ocr/types';

// Mock the MathJaxAdapter renderToSvg function
vi.mock('../../adapters/equation/MathJaxAdapter', () => ({
  renderToSvg: vi.fn().mockImplementation(async (latex) => {
    return `<svg data-testid="mock-svg"><text>${latex}</text></svg>`;
  }),
}));

describe('EquationOverlay', () => {
  it('renders nothing when there are no equations', () => {
    const mockStore = new OcrStore();
    const { container } = render(
      <EquationOverlay ocrStore={mockStore} pageNumber={1} scale={1} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders equations and reacts to edits', async () => {
    const mockStore = new OcrStore();
    
    // Stub resultsByPage inside store directly for test isolation
    (mockStore as unknown as { resultsByPage: OcrResultsByPage }).resultsByPage[1] = {
      pageNumber: 1,
      status: 'complete',
      language: 'eng',
      confidence: 0.9,
      blocks: [
        {
          id: 'eq-1',
          type: 'equation',
          rect: { x: 10, y: 20, width: 100, height: 50 },
          latex: 'E = mc^2',
          confidence: 0.95,
          source: 'pix2tex',
        },
      ],
      warnings: [],
    };

    render(<EquationOverlay ocrStore={mockStore} pageNumber={1} scale={1} />);

    // Wait for async rendering of SVG
    await waitFor(() => {
      expect(screen.getByTestId('mock-svg')).toBeInTheDocument();
    });

    expect(screen.getByText('E = mc^2')).toBeInTheDocument();
    
    // Find edit button
    const editBtn = screen.getByText('[Edit]');
    expect(editBtn).toBeInTheDocument();

    // Click [Edit] to open popover
    await act(async () => {
      fireEvent.click(editBtn);
    });

    // Verify Editor text area is rendered
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('E = mc^2');

    // Make an edit and save
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'E = hf' } });
    });
    
    const saveBtn = screen.getByText('Save');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verify the store is updated
    expect(mockStore.getResultsByPage()[1].blocks[0].latex).toBe('E = hf');
  });
});
