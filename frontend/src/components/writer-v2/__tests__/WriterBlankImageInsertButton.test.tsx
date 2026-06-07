import {
  beforeEach,
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
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterBlankImageInsertButton } from '../WriterBlankImageInsertButton';

describe('WriterBlankImageInsertButton', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
    useEditorStore.setState({ activeMode: 'annotate' });
  });

  it('renders disabled button when blank document is not active', () => {
    render(<WriterBlankImageInsertButton disabled />);

    expect(screen.getByRole('button', { name: /^Image$/i })).toBeDisabled();
    expect(screen.getByLabelText(/insert image into blank writer document/i)).toBeTruthy();
  });

  it('inserts selected image as asset and imageBox element', async () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-image-insert-doc',
    });

    render(<WriterBlankImageInsertButton />);

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'sample.png', {
      type: 'image/png',
    });

    fireEvent.change(screen.getByLabelText(/insert image into blank writer document/i), {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(useWriterV2Store.getState().assetRecords).toHaveLength(1);
      expect(useWriterV2Store.getState().elements).toHaveLength(1);
    });

    const state = useWriterV2Store.getState();
    const image = state.elements[0];
    const asset = state.assetRecords[0];

    expect(image.type).toBe('imageBox');
    expect(image.imageAssetId).toBe(asset.id);
    expect(image.assetIds).toEqual([asset.id]);
    expect(asset.mimeType).toBe('image/png');
    expect(asset.dataUrl.startsWith('data:image/png;')).toBe(true);
    expect(state.selectedIds).toEqual([image.id]);
    expect(state.activeWriterTool).toBe('select');
    expect(useEditorStore.getState().activeMode).toBe('write');
  });
});
