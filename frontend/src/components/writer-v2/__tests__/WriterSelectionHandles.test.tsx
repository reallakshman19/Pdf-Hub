import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { WriterSelectionHandles } from '../WriterSelectionHandles';

describe('WriterSelectionHandles', () => {
  it('renders selection box and eight deterministic resize handles', () => {
    render(<WriterSelectionHandles onResizePointerDown={() => undefined} />);

    expect(screen.getByTestId('writer-v2-selection-box')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-n')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-ne')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-e')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-se')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-s')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-sw')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-w')).toBeTruthy();
    expect(screen.getByTestId('writer-v2-resize-handle-nw')).toBeTruthy();
  });

  it('reports the active resize handle on pointer down', () => {
    const onResizePointerDown = vi.fn();

    render(<WriterSelectionHandles onResizePointerDown={onResizePointerDown} />);

    fireEvent.pointerDown(screen.getByTestId('writer-v2-resize-handle-se'), {
      pointerId: 1,
      clientX: 120,
      clientY: 140,
    });

    expect(onResizePointerDown).toHaveBeenCalledTimes(1);
    expect(onResizePointerDown.mock.calls[0][1]).toBe('se');
  });
});
