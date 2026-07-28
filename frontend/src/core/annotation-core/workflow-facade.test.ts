import { describe, expect, it, vi } from 'vitest';
import { createAnnotationWorkflow } from './workflow-facade';
import { PIPING_ISO_PLACEMENT_POLICY } from './placement-policy';
import type { PageScene } from './page-scene';

describe('Workflow Facade (Phase E - Package Boundary Refactor)', () => {
  it('executes a complete annotation lifecycle with canonical interface (AD-10)', async () => {
    const scene: PageScene = {
      pageNumber: 1,
      pageBounds: { x: 0, y: 0, width: 600, height: 800 },
      obstacles: [],
      protectedRegions: [],
    };

    const workflow = createAnnotationWorkflow({
      workflowId: 'test-workflow',
      version: '1.0.0',
      defaultPlacementPolicy: PIPING_ISO_PLACEMENT_POLICY,
      extractTargets: vi.fn().mockResolvedValue([{ id: 't1', pageNumber: 1, location: { type: 'bounding-box', box: { x: 10, y: 10, width: 50, height: 10 } }, textSnippet: 'PS-101' }]),
      planContent: vi.fn().mockResolvedValue([{ id: 'c1', targetId: 't1', fields: [{ key: 'note', value: 'Test note' }], displayHeader: 'Tag' }]),
      solvePlacement: vi.fn().mockResolvedValue([{ id: 'p1', targetPoint: { x: 10, y: 10 }, box: { x: 100, y: 100, width: 100, height: 30 } }]),
      renderOutput: vi.fn().mockResolvedValue(new Uint8Array([10, 20, 30])),
      verifyOutput: vi.fn().mockResolvedValue(true),
    });

    const result = await workflow.execute('test-input', scene, new Uint8Array([1, 2, 3]));

    expect(result.verified).toBe(true);
    expect(result.plans).toHaveLength(1);
    expect(result.output).toEqual(new Uint8Array([10, 20, 30]));
  });
});
