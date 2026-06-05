import { beforeEach, describe, expect, it } from 'vitest';
import { useWriterV2Store } from './writerV2Store';

describe('writerV2Store tool policy', () => {
  beforeEach(() => {
    localStorage.clear();
    useWriterV2Store.getState().clearWriterV2();
  });

  it('prevents legacy placement tool activation by default', () => {
    useWriterV2Store.getState().setActiveWriterTool('textStamp');

    expect(useWriterV2Store.getState().activeWriterTool).toBe('select');
  });

  it('preserves select box copy tool activation', () => {
    useWriterV2Store.getState().setActiveWriterTool('selectBoxCopy');

    expect(useWriterV2Store.getState().activeWriterTool).toBe('selectBoxCopy');
  });

  it('allows legacy placement activation when debug flag is enabled', () => {
    localStorage.setItem('writer-v2-enable-legacy-placement', '1');

    useWriterV2Store.getState().setActiveWriterTool('textStamp');

    expect(useWriterV2Store.getState().activeWriterTool).toBe('textStamp');
  });
});
