import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThumbnailMacroConfigDialog } from './ThumbnailMacroConfigDialog';

describe('ThumbnailMacroConfigDialog visual mask guardrail', () => {
  it('uses explicit non-secure wording and emits a visual-mask warning', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="visualMask"
        pageIndices={[0, 1]}
        pageIds={['p1', 'p2']}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByText(/visual mask \(not secure redaction\)/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/do not permanently remove/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/searchable, copyable, or extractable/i);

    fireEvent.click(screen.getByRole('button', { name: /apply visual mask/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'DRAW_REDACTION_BOX',
      payload: {
        pageIndices: [0, 1],
      },
    });
    expect(onApply.mock.calls[0]?.[1]).toMatch(/not securely removed/i);
  });

  it('emits a canonical PageId-targeted template for page-number configuration', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="pageNumbers"
        pageIndices={[1, 3]}
        pageIds={['p2', 'p4']}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(
      screen.getByDisplayValue(
        'Page {{physicalPage}} of {{pageCount}}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/physicalPage/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          rules: [
            {
              selector: {
                include: {
                  mode: 'pageIds',
                  pageIds: ['p2', 'p4'],
                },
              },
              footer: {
                center: {
                  kind: 'text',
                  template:
                    'Page {{physicalPage}} of {{pageCount}}',
                },
              },
            },
          ],
        },
      },
    });
    expect(
      JSON.stringify(onApply.mock.calls[0]?.[0]),
    ).not.toContain('ADD_HEADER_FOOTER_TEXT');
  });

  it('customizes Add Page Numbers position, format, start number, margins, and font', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="pageNumbers"
        pageIndices={[0, 1]}
        pageIds={['p1', 'p2']}
        allPageIds={['p1', 'p2', 'p3']}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText('Page number format'), {
      target: { value: 'n-of-m' },
    });
    fireEvent.change(screen.getByLabelText('Start number'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Position'), {
      target: { value: 'header' },
    });
    fireEvent.change(screen.getByLabelText('Alignment'), {
      target: { value: 'right' },
    });
    fireEvent.change(screen.getByLabelText('Font'), {
      target: { value: 'Times Roman' },
    });
    fireEvent.change(screen.getByLabelText('Font style'), {
      target: { value: 'bold' },
    });
    fireEvent.change(screen.getByLabelText('Font size'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Horizontal margin (pt)'), {
      target: { value: '36' },
    });
    fireEvent.change(screen.getByLabelText('Vertical margin (pt)'), {
      target: { value: '28' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          layout: {
            leftMarginPt: 36,
            rightMarginPt: 36,
            headerOffsetFromTopPt: 28,
            footerOffsetFromBottomPt: 28,
          },
          defaultTextStyle: {
            fontFamily: 'Times Roman',
            fontSizePt: 12,
            fontWeight: 'bold',
            fontStyle: 'normal',
          },
          rules: [
            {
              startNumber: 5,
              selector: {
                include: {
                  mode: 'pageIds',
                  pageIds: ['p1', 'p2'],
                },
              },
              header: {
                right: {
                  kind: 'text',
                  template: '{{physicalPage}} / {{pageCount}}',
                },
              },
            },
          ],
        },
      },
    });
  });

  it('customizes Add File Header text, position, font, and page scope', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="fileHeader"
        pageIndices={[0, 1, 2]}
        pageIds={['p1', 'p2', 'p3']}
        allPageIds={['p1', 'p2', 'p3']}
        currentPageIndex={1}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Date' }));
    fireEvent.change(screen.getByLabelText('Position'), {
      target: { value: 'footer' },
    });
    fireEvent.change(screen.getByLabelText('Alignment'), {
      target: { value: 'left' },
    });
    fireEvent.change(screen.getByLabelText('Font'), {
      target: { value: 'Courier' },
    });
    fireEvent.change(screen.getByLabelText('Font style'), {
      target: { value: 'italic' },
    });
    fireEvent.change(screen.getByLabelText('Pages scope'), {
      target: { value: 'current' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          defaultTextStyle: {
            fontFamily: 'Courier',
            fontWeight: 'normal',
            fontStyle: 'italic',
          },
          rules: [
            {
              selector: {
                include: {
                  mode: 'pageIds',
                  pageIds: ['p2'],
                },
              },
              footer: {
                left: {
                  kind: 'text',
                  template: '{{fileName}} {{date}}',
                },
              },
            },
          ],
        },
      },
    });
  });

  it('customizes Batch Text Stamp text, placement, opacity, and validated page range', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="textStamp"
        pageIndices={[0, 1, 2]}
        pageIds={['p1', 'p2', 'p3']}
        allPageIds={['p1', 'p2', 'p3']}
        pageHeightPt={842}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'APPROVED {date}' },
    });
    fireEvent.change(screen.getByLabelText('Placement'), {
      target: { value: 'top-right' },
    });
    fireEvent.change(screen.getByLabelText('Opacity'), {
      target: { value: '0.4' },
    });
    fireEvent.change(screen.getByLabelText('Pages scope'), {
      target: { value: 'range' },
    });

    fireEvent.change(screen.getByLabelText('Page range'), {
      target: { value: '1-99' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds|out of bounds|1 to 3/i);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Page range'), {
      target: { value: '1, 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'DRAW_TEXT_ON_PAGES',
      payload: {
        pageIndices: [0, 2],
        options: {
          text: 'APPROVED {date}',
          x: 32,
          y: 794,
          align: 'right',
          opacity: 0.4,
          pageNumberToken: true,
          fileNameToken: true,
          dateToken: true,
        },
      },
    });
  });
});
