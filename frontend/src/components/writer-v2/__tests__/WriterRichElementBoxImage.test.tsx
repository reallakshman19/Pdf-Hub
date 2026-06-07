import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { WriterRichElementBox } from '../WriterRichElementBox';

const viewport: WriterPageViewport = {
  pdfWidth: 612,
  pdfHeight: 792,
  rotation: 0,
  scale: 1,
};

describe('WriterRichElementBox image rendering', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders imageBox using the matching writer asset data URL', () => {
    useWriterV2Store.getState().addWriterAssets([
      {
        id: 'asset-image-1',
        documentFingerprint: 'image-doc',
        kind: 'image',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,QUJDRA==',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    render(
      <WriterRichElementBox
        element={makeImageElement('asset-image-1')}
        viewport={viewport}
        selected={false}
        isEditing={false}
        onBeginDrag={vi.fn()}
        onUpdateDrag={vi.fn()}
        onEndDrag={vi.fn()}
        onDoubleClick={vi.fn()}
        viewportRect={{ x: 10, y: 20, width: 120, height: 80 }}
      />,
    );

    const image = screen.getByRole('img', { name: /writer inserted asset/i });

    expect(image).toBeTruthy();
    expect(image).toHaveAttribute('src', 'data:image/png;base64,QUJDRA==');
    expect(screen.queryByText(/missing image asset/i)).toBeNull();
  });

  it('renders missing asset fallback when image asset is unavailable', () => {
    render(
      <WriterRichElementBox
        element={makeImageElement('missing-asset')}
        viewport={viewport}
        selected={false}
        isEditing={false}
        onBeginDrag={vi.fn()}
        onUpdateDrag={vi.fn()}
        onEndDrag={vi.fn()}
        onDoubleClick={vi.fn()}
        viewportRect={{ x: 10, y: 20, width: 120, height: 80 }}
      />,
    );

    expect(screen.getByText(/missing image asset/i)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

function makeImageElement(imageAssetId: string): WriterElementV2 {
  return {
    id: 'image-element-1',
    documentFingerprint: 'image-doc',
    pageIndex: 0,
    type: 'imageBox',
    rect: {
      x: 10,
      y: 20,
      width: 120,
      height: 80,
    },
    plainText: 'Image',
    imageAssetId,
    assetIds: [imageAssetId],
    style: {
      zIndex: 1,
      backgroundColor: 'transparent',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
