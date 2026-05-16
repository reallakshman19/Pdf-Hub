import { describe, expect, it } from 'vitest';
import { runWriterOverlayV2FinalSmoke } from './writerOverlayV2FinalSmoke';

describe('Writer Overlay V2 final smoke', () => {
  it('passes create/edit/export/project-restore smoke path', async () => {
    const result = await runWriterOverlayV2FinalSmoke();

    expect(result.verdict).toBe('PASS');
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.metrics.sourcePageCount).toBe(1);
    expect(result.metrics.flattenedPageCount).toBe(1);
    expect(result.metrics.projectElementCount).toBe(2);
    expect(result.metrics.importedElementCount).toBe(2);
    expect(result.metrics.restoredEditableElementCount).toBe(2);
  });
});