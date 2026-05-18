import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MacrosSidebar } from './MacrosSidebar';
import { useSessionStore } from '@/core/session/store';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';

vi.mock('@/core/macro/sessionRunner', () => ({
  runMacroRecipeAgainstSession: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    savePdfBytes: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/core/logger/service', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const runMacroRecipeAgainstSessionMock = vi.mocked(runMacroRecipeAgainstSession);

function openTestDocument() {
  useSessionStore.getState().openDocument({
    documentKey: 'gd-1a-test-document',
    fileName: 'input-document.pdf',
    bytes: new Uint8Array([1, 2, 3, 4]),
    pageCount: 3,
    saveHandle: null,
  });
}

function selectGenerationTemplate(templateId: string) {
  const generateSection = getGenerateSection();
  const select = within(generateSection).getByRole('combobox');
  fireEvent.change(select, { target: { value: templateId } });
  return generateSection;
}

function getGenerateSection() {
  const section = screen
    .getByText('Generate Document')
    .closest('section');

  if (!section) {
    throw new Error('Generate Document section was not found.');
  }

  return section;
}

describe('MacrosSidebar Generate Document', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clearDocument();
    openTestDocument();
  });

  it('renders dynamic fields for selected template', () => {
    render(<MacrosSidebar />);

    const generateSection = getGenerateSection();

    expect(within(generateSection).getAllByLabelText(/Title/i).length).toBeGreaterThan(0);
    expect(within(generateSection).getByLabelText(/Author/i)).toBeInTheDocument();
    expect(within(generateSection).getByLabelText(/Department/i)).toBeInTheDocument();
    expect(within(generateSection).getByLabelText(/Status/i)).toBeInTheDocument();

    selectGenerationTemplate('branded_cover_page');

    expect(within(generateSection).getAllByLabelText(/Title/i).length).toBeGreaterThan(0);
    expect(within(generateSection).getByLabelText(/Subtitle/i)).toBeInTheDocument();
    expect(within(generateSection).getByLabelText(/Prepared For/i)).toBeInTheDocument();
    expect(within(generateSection).getByLabelText(/Prepared By/i)).toBeInTheDocument();
  });

  it('branded cover generate button is not disabled when no image is uploaded', () => {
    render(<MacrosSidebar />);

    const generateSection = selectGenerationTemplate('branded_cover_page');

    expect(
      within(generateSection).getByText('No image selected — using placeholder.'),
    ).toBeInTheDocument();

    const generateButton = within(generateSection).getByRole('button', {
      name: /Generate PDF/i,
    });

    expect(generateButton).not.toBeDisabled();
  });

  it('successful generate pushes generated-report.pdf into Output Queue', async () => {
    runMacroRecipeAgainstSessionMock.mockResolvedValueOnce({
      success: true,
      outputFiles: [
        {
          name: 'generated-report.pdf',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      logs: ['Generated report page', 'Created output generated-report.pdf'],
      finalBytes: new Uint8Array([9]),
      selectedPages: [],
      stepResults: [],
    });

    render(<MacrosSidebar />);

    const generateSection = getGenerateSection();

    fireEvent.click(
      within(generateSection).getByRole('button', {
        name: /Generate PDF/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('generated-report.pdf')).toBeInTheDocument();
    });
  });

  it('successful generate displays Generated report page in logs', async () => {
    runMacroRecipeAgainstSessionMock.mockResolvedValueOnce({
      success: true,
      outputFiles: [
        {
          name: 'generated-report.pdf',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      logs: ['Generated report page', 'Created output generated-report.pdf'],
      finalBytes: new Uint8Array([9]),
      selectedPages: [],
      stepResults: [],
    });

    render(<MacrosSidebar />);

    const generateSection = getGenerateSection();

    fireEvent.click(
      within(generateSection).getByRole('button', {
        name: /Generate PDF/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Generated report page')).toBeInTheDocument();
    });
  });

  it('failed generate displays Generation failed: test error', async () => {
    runMacroRecipeAgainstSessionMock.mockResolvedValueOnce({
      success: false,
      outputFiles: [],
      logs: ['Generation failed: test error'],
      finalBytes: new Uint8Array([9]),
      selectedPages: [],
      stepResults: [],
    });

    render(<MacrosSidebar />);

    const generateSection = getGenerateSection();

    fireEvent.click(
      within(generateSection).getByRole('button', {
        name: /Generate PDF/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Generation failed: test error')).toBeInTheDocument();
    });
  });

  it('successful generate falls back to finalBytes when macro produces no outputFiles', async () => {
    runMacroRecipeAgainstSessionMock.mockResolvedValueOnce({
      success: true,
      outputFiles: [],
      logs: ['Added content page at index 0.'],
      finalBytes: new Uint8Array([9, 8, 7]),
      selectedPages: [],
      stepResults: [],
    });

    render(<MacrosSidebar />);

    const generateSection = getGenerateSection();

    fireEvent.click(
      within(generateSection).getByRole('button', {
        name: /Generate PDF/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('professional-report.pdf')).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Generate Document completed but produced no output files.'),
    ).not.toBeInTheDocument();
  });

});
