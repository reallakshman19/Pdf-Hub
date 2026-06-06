import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { OcrDemoFixture } from '@/core/ocr/fixtures/ocrDemoFixtures';
import { OcrDemoFixturePanel } from '../OcrDemoFixturePanel';

describe('OcrDemoFixturePanel', () => {
  it('renders demo fixture panel', () => {
    render(
      <OcrDemoFixturePanel />,
    );

    expect(screen.getByTestId('ocr-demo-fixture-panel')).toBeTruthy();
    expect(screen.getByText('OCR Demo Fixtures')).toBeTruthy();
    expect(screen.getByTestId('ocr-demo-fixture-select')).toBeTruthy();
    expect(screen.getByTestId('ocr-demo-fixture-description')).toBeTruthy();
  });

  it('changes selected fixture', () => {
    render(
      <OcrDemoFixturePanel />,
    );

    fireEvent.change(screen.getByTestId('ocr-demo-fixture-select'), {
      target: {
        value: 'engineering-note',
      },
    });

    expect(screen.getByTestId('ocr-demo-fixture-select')).toHaveValue('engineering-note');
    
    const descriptionBlock = screen.getByTestId('ocr-demo-fixture-description');
    expect(descriptionBlock.textContent).toContain('Engineering Note OCR');
  });

  it('loads fixture and emits callback', async () => {
    let loaded: OcrDemoFixture | null = null;

    render(
      <OcrDemoFixturePanel
        onFixtureLoaded={(fixture) => {
          loaded = fixture;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-demo-fixture-load'));

    await waitFor(() => {
      expect(loaded).not.toBeNull();
    });

    const finalLoaded = loaded as unknown as OcrDemoFixture;
    expect(finalLoaded.documentFingerprint).toBe('ocr-demo-clean-text');
    expect(finalLoaded.pdfBytes.length).toBeGreaterThan(100);
    expect(screen.getByTestId('ocr-demo-fixture-message')).toBeTruthy();
    expect(screen.getByText(/Loaded Clean Text OCR/)).toBeTruthy();
  });

  it('loads table fixture', async () => {
    let loaded: OcrDemoFixture | null = null;

    render(
      <OcrDemoFixturePanel
        onFixtureLoaded={(fixture) => {
          loaded = fixture;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-demo-fixture-select'), {
      target: {
        value: 'simple-table',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-demo-fixture-load'));

    await waitFor(() => {
      expect(loaded).not.toBeNull();
    });

    const finalLoaded = loaded as unknown as OcrDemoFixture;
    expect(finalLoaded.descriptor.hasTable).toBe(true);
    expect(finalLoaded.projectPayload.writerInsertionQueue.candidates).toHaveLength(1);
  });

  it('disables controls when disabled', () => {
    render(
      <OcrDemoFixturePanel disabled />,
    );

    expect(screen.getByTestId('ocr-demo-fixture-select')).toBeDisabled();
    expect(screen.getByTestId('ocr-demo-fixture-load')).toBeDisabled();
  });
});
