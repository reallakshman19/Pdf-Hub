import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { computeCalloutPath } from '../annotations/callout-geometry';

describe('Callout and FreeText rendering fidelity', () => {
  it('correctly reads all callouts with CL coordinates and OpenArrow endings', async () => {
    const filePath = path.resolve(__dirname, '../../../../Markup for SYS-008A.pdf');
    const nodeBuf = fs.readFileSync(filePath);
    const bytes = new Uint8Array(nodeBuf.buffer, nodeBuf.byteOffset, nodeBuf.byteLength);
    const result = await readNativePdfAnnotations(bytes);

    const callouts = result.annotations.filter((a) => a.type === 'callout');
    expect(callouts.length).toBeGreaterThan(0);

    // Verify Delete Trunnion callout
    const deleteTrunnion = callouts.find((c) => c.data.text === 'Delete Trunnion');
    expect(deleteTrunnion).toBeDefined();
    expect(deleteTrunnion?.data.anchor).toBeDefined();
    expect(deleteTrunnion?.data.knee).toBeDefined();
    expect(deleteTrunnion?.data.arrowHead).toBe('open');

    // Verify geometry calculation connects from box through knee to anchor
    const geom = computeCalloutPath(
      deleteTrunnion!.data.anchor!,
      deleteTrunnion!.rect,
      {
        leaderStyle: 'elbow',
        kneePoint: deleteTrunnion!.data.knee,
      }
    );

    expect(geom.points.length).toBe(3);
    // Last point must be the anchor point where the arrow is placed
    expect(geom.points[2].x).toBeCloseTo(deleteTrunnion!.data.anchor!.x, 1);
    expect(geom.points[2].y).toBeCloseTo(deleteTrunnion!.data.anchor!.y, 1);
    // Middle point must be the knee
    expect(geom.points[1].x).toBeCloseTo(deleteTrunnion!.data.knee!.x, 1);
    expect(geom.points[1].y).toBeCloseTo(deleteTrunnion!.data.knee!.y, 1);
  }, 20000);

  it('correctly extracts font family and does not assign false borders to bare textboxes', async () => {
    const filePath = path.resolve(__dirname, '../../../../Markup for SYS-008A.pdf');
    const nodeBuf = fs.readFileSync(filePath);
    const bytes = new Uint8Array(nodeBuf.buffer, nodeBuf.byteOffset, nodeBuf.byteLength);
    const result = await readNativePdfAnnotations(bytes);

    // Dimension text '2200' has no border in PDF
    const dim2200 = result.annotations.find((a) => a.data.text === '2200');
    expect(dim2200).toBeDefined();
    expect(dim2200?.data.borderWidth ?? 0).toBe(0);

    // Supported on Civil frame has Helvetica font family and #3faa54 color
    const civil = result.annotations.find((a) => a.data.text?.includes('Supported on Civil frame'));
    expect(civil).toBeDefined();
    expect(civil?.data.textColor?.toLowerCase()).toBe('#3faa54');
    expect(civil?.data.fontFamily).toContain('Helvetica');
  }, 20000);
});
