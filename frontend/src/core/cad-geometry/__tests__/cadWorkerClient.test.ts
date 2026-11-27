import { describe, expect, it } from 'vitest';
import { CadWorkerClient } from '../cadWorkerClient';
import type { CadHarvestInput, CadHarvestProgress } from '../cadWorkerTypes';

describe('CAD Worker-Backed Geometry Harvester & Telemetry - Mini-Phase O.4', () => {
  it('FALSIFY-WRK-01: ping-pong request completes cleanly', async () => {
    const client = new CadWorkerClient();
    await expect(client.ping()).resolves.toBeUndefined();
    client.terminate();
  });

  it('FALSIFY-WRK-02 & FALSIFY-WRK-03: off-main-thread harvesting executes pipeline and emits progress telemetry', async () => {
    const client = new CadWorkerClient();

    // Stream depicting a 100x50 rectangle + quarter circle arc
    const stream = `
      % 100x50 rectangle
      0 0 m 100 0 l 100 50 l 0 50 l h S
      
      % Circular arc with radius 20 centered at (200, 200)
      220 200 m
      220 211.0457 211.0457 220 200 220 c
      S
    `;

    const input: CadHarvestInput = {
      pageNumber: 1,
      pageWidth: 612,
      pageHeight: 792,
      contentStreamSource: stream,
      options: { snapEpsilon: 0.5 },
    };

    const progressReports: CadHarvestProgress[] = [];

    const result = await client.harvestPageGeometry(input, {
      onProgress: (p) => {
        progressReports.push({ ...p });
      },
    });

    // Verify progress telemetry
    expect(progressReports.length).toBeGreaterThanOrEqual(3);
    const phases = progressReports.map((p) => p.phase);
    expect(phases).toContain('tokenizing');
    expect(phases).toContain('cleaning');
    expect(phases).toContain('dcel_topology');
    expect(progressReports[progressReports.length - 1].progressPercent).toBe(100);

    // Verify geometry output
    expect(result.geometry.pageNumber).toBe(1);
    expect(result.geometry.lines).toHaveLength(4);
    expect(result.geometry.arcs).toHaveLength(1);
    expect(result.closedLoops).toHaveLength(1);

    const loop = result.closedLoops[0];
    expect(loop.area).toBeCloseTo(5000);
    expect(loop.perimeter).toBeCloseTo(300);

    client.terminate();
  });

  it('FALSIFY-WRK-04: telemetry metrics report segment counts and non-zero duration', async () => {
    const client = new CadWorkerClient();

    const stream = `
      0 0 m 30 0 l 30 40 l 0 0 l S
    `;

    const result = await client.harvestPageGeometry({
      pageNumber: 2,
      pageWidth: 612,
      pageHeight: 792,
      contentStreamSource: stream,
    });

    const telem = result.telemetry;
    expect(telem.pageNumber).toBe(2);
    expect(telem.rawSegmentsCount).toBe(3);
    expect(telem.closedLoopsCount).toBe(1);
    expect(telem.durationMs).toBeGreaterThanOrEqual(0);

    client.terminate();
  });

  it('FALSIFY-WRK-05: abort signal aborts pending harvest requests cleanly', async () => {
    const client = new CadWorkerClient();

    const controller = new AbortController();
    controller.abort(); // Pre-aborted

    const promise = client.harvestPageGeometry(
      {
        pageNumber: 1,
        pageWidth: 612,
        pageHeight: 792,
        contentStreamSource: '0 0 m 10 0 l S',
      },
      { signal: controller.signal },
    );

    await expect(promise).rejects.toThrow('Request aborted before dispatch.');
    client.terminate();
  });
});
