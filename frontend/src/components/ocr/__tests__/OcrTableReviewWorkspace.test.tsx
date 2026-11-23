import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { mockOcrEngine } from '@/core/ocr/engines/mockOcrEngine';
import { getOcrProfile } from '@/core/ocr/ocrProfiles';
import type { OcrTableBlock } from '@/core/ocr/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { OcrTableReviewWorkspace } from '../workflow/OcrTableReviewWorkspace';

describe('OcrTableReviewWorkspace', () => {
  it('renders table review panel and handles table acceptance', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-test-fp',
      profile: getOcrProfile('table-heavy'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const mockTableBlock = document.pages[0].blocks.find((block) => block.type === 'table') as OcrTableBlock;
    let acceptedElement: WriterElementV2 | null = null;
    let acceptedSummary = '';

    render(
      <OcrTableReviewWorkspace
        documentFingerprint="doc-test-fp"
        tableBlock={mockTableBlock}
        onAcceptTableElement={(element, summary) => {
          acceptedElement = element;
          acceptedSummary = summary;
        }}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-table')).toBeTruthy();
    expect(screen.getByDisplayValue('Valve')).toBeTruthy();

    const acceptBtn = screen.getByTestId('ocr-table-accept');
    fireEvent.click(acceptBtn);

    expect(acceptedElement).not.toBeNull();
    expect(acceptedElement!.type).toBe('tableBox');
    expect(acceptedElement!.documentFingerprint).toBe('doc-test-fp');
    expect(acceptedSummary).toContain('columns');
    expect(screen.getByTestId('ocr-table-accepted-summary')).toBeTruthy();
  });
});
