import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeTextPreview } from './FreeTextPreview';

describe('FreeTextPreview', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('warns when preview text overflows and removes the warning after resizing', () => {
    let scrollHeight = 80;
    let onResize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe() {}
      disconnect() { disconnect(); }
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);

    const view = render(<FreeTextPreview text="A long multiline annotation" styleKey="40" />);
    expect(screen.getByRole('status').textContent).toBe('Preview clipped');
    expect(screen.getByRole('status').getAttribute('title')).toContain('saved PDF may fit the text differently');

    scrollHeight = 40;
    act(() => { onResize?.([], {} as ResizeObserver); });
    expect(screen.queryByRole('status')).toBeNull();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('remeasures after a text or font style change and detects horizontal overflow', () => {
    let scrollWidth = 100;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => scrollWidth);
    const view = render(<FreeTextPreview text="old" styleKey="12" />);
    expect(screen.queryByRole('status')).toBeNull();

    scrollWidth = 101;
    view.rerender(<FreeTextPreview text="new" styleKey="12" />);
    expect(screen.getByRole('status').textContent).toBe('Preview clipped');

    scrollWidth = 100;
    view.rerender(<FreeTextPreview text="new" styleKey="10" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a compact warning and explanatory tooltip inside a small preview', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(10);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(30);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(20);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(20);
    render(<FreeTextPreview text="long text" styleKey="small" />);
    const warning = screen.getByRole('status');
    expect(warning.textContent).toBe('!');
    expect(warning.getAttribute('aria-label')).toContain('preview is clipped');
    expect(warning.parentElement?.getAttribute('title')).toContain('saved PDF may fit the text differently');
    expect(warning.style.maxWidth).toBe('100%');
    expect(warning.style.maxHeight).toBe('100%');
  });
});
