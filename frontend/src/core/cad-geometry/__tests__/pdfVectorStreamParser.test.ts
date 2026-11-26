import { describe, expect, it } from 'vitest';
import { parseContentStreamVectors } from '../pdfVectorStreamParser';
import {
  createRotationMatrix,
  createScalingMatrix,
  createTranslationMatrix,
  invertAffineMatrix,
  multiplyAffineMatrices,
  transformPoint,
} from '../matrix';

describe('CAD Vector Harvesting - Mini-Phase O.1 Stream Parser & Matrix Math', () => {
  describe('Affine Matrix 2D Math', () => {
    it('transforms 2D points accurately with translation, scaling, and rotation', () => {
      // Translation
      const trans = createTranslationMatrix(50, 100);
      const ptTrans = transformPoint({ x: 10, y: 20 }, trans);
      expect(ptTrans.x).toBeCloseTo(60);
      expect(ptTrans.y).toBeCloseTo(120);

      // Scaling
      const scale = createScalingMatrix(2.5, 4);
      const ptScale = transformPoint({ x: 10, y: 20 }, scale);
      expect(ptScale.x).toBeCloseTo(25);
      expect(ptScale.y).toBeCloseTo(80);

      // Rotation 90 degrees (pi/2)
      const rot90 = createRotationMatrix(Math.PI / 2);
      const ptRot = transformPoint({ x: 10, y: 0 }, rot90);
      expect(ptRot.x).toBeCloseTo(0);
      expect(ptRot.y).toBeCloseTo(10);
    });

    it('correctly multiplies affine matrices and inverts non-singular transformations', () => {
      const m1 = createTranslationMatrix(20, 30);
      const m2 = createScalingMatrix(2, 2);
      const combined = multiplyAffineMatrices(m2, m1);

      // Point (5, 5) -> scale by 2 -> (10, 10) -> translate by (20, 30) -> (30, 40)
      const transformed = transformPoint({ x: 5, y: 5 }, combined);
      expect(transformed.x).toBeCloseTo(30);
      expect(transformed.y).toBeCloseTo(40);

      const inv = invertAffineMatrix(combined);
      expect(inv).not.toBeNull();
      if (inv) {
        const roundTrip = transformPoint(transformed, inv);
        expect(roundTrip.x).toBeCloseTo(5);
        expect(roundTrip.y).toBeCloseTo(5);
      }

      // Singular matrix returns null
      const singular = invertAffineMatrix([0, 0, 0, 0, 10, 10]);
      expect(singular).toBeNull();
    });
  });

  describe('Content Stream Operator Parser & Tokenizer', () => {
    it('FALSIFY-VEC-01: extracts discrete CadLineSegment items with exact Euclidean lengths and closed subpaths', () => {
      // Content stream representing a right triangle: (0,0) -> (30, 0) -> (30, 40) -> close -> Stroke
      const stream = `
        1 w
        0 0 m
        30 0 l
        30 40 l
        h
        S
      `;

      const result = parseContentStreamVectors(stream, { pageNumber: 1, pageWidth: 612, pageHeight: 792 });

      expect(result.lines).toHaveLength(3);
      // Segment 1: (0,0) to (30,0) length 30
      expect(result.lines[0].start).toEqual({ x: 0, y: 0 });
      expect(result.lines[0].end).toEqual({ x: 30, y: 0 });
      expect(result.lines[0].length).toBeCloseTo(30);

      // Segment 2: (30,0) to (30,40) length 40
      expect(result.lines[1].start).toEqual({ x: 30, y: 0 });
      expect(result.lines[1].end).toEqual({ x: 30, y: 40 });
      expect(result.lines[1].length).toBeCloseTo(40);

      // Segment 3: (30,40) back to (0,0) length 50 (hypotenuse)
      expect(result.lines[2].start).toEqual({ x: 30, y: 40 });
      expect(result.lines[2].end).toEqual({ x: 0, y: 0 });
      expect(result.lines[2].length).toBeCloseTo(50);

      // Verify path metadata
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].paintingOp).toBe('stroke');
      expect(result.paths[0].subpaths[0].isClosed).toBe(true);
      expect(result.totalExtractedSegments).toBe(3);
    });

    it('FALSIFY-VEC-02: transforms path coordinates through CTM concatenation (cm operator)', () => {
      // Stream that translates by (100, 200) and scales by (2, 2)
      const stream = `
        1 0 0 1 100 200 cm
        2 0 0 2 0 0 cm
        10 10 m
        20 10 l
        S
      `;

      const result = parseContentStreamVectors(stream, { pageNumber: 1 });

      expect(result.lines).toHaveLength(1);
      const line = result.lines[0];
      // (10, 10) * 2 + (100, 200) = (120, 220)
      expect(line.start.x).toBeCloseTo(120);
      expect(line.start.y).toBeCloseTo(220);

      // (20, 10) * 2 + (100, 200) = (140, 220)
      expect(line.end.x).toBeCloseTo(140);
      expect(line.end.y).toBeCloseTo(220);

      // Length in transformed user coordinates: 20
      expect(line.length).toBeCloseTo(20);
    });

    it('FALSIFY-VEC-03: graphics state isolation (q / Q) preserves and restores prior CTM and color state', () => {
      const stream = `
        0.5 G
        0.3 g
        1 w
        0 0 m 10 0 l S
        q
          1 0 0 RG
          2 w
          1 0 0 1 50 50 cm
          0 0 m 10 0 l S
        Q
        0 0 m 10 0 l S
      `;

      const result = parseContentStreamVectors(stream);

      expect(result.lines).toHaveLength(3);

      // Line 1: stroke gray 0.5 (#808080), width 1, at (0,0) -> (10,0)
      expect(result.lines[0].strokeColor).toBe('#808080');
      expect(result.lines[0].strokeWidth).toBe(1);
      expect(result.lines[0].start).toEqual({ x: 0, y: 0 });
      expect(result.lines[0].end).toEqual({ x: 10, y: 0 });

      // Line 2: inside q...Q: red (#ff0000), width 2, translated by (50, 50)
      expect(result.lines[1].strokeColor).toBe('#ff0000');
      expect(result.lines[1].strokeWidth).toBe(2);
      expect(result.lines[1].start).toEqual({ x: 50, y: 50 });
      expect(result.lines[1].end).toEqual({ x: 60, y: 50 });

      // Line 3: after Q: restored to stroke gray 0.5, width 1, at (0,0) -> (10,0)
      expect(result.lines[2].strokeColor).toBe('#808080');
      expect(result.lines[2].strokeWidth).toBe(1);
      expect(result.lines[2].start).toEqual({ x: 0, y: 0 });
      expect(result.lines[2].end).toEqual({ x: 10, y: 0 });
    });

    it('FALSIFY-VEC-04: cubic Beziers (c, v, y) and rectangles (re) parse into CadCubicBezier and CadRectPrimitive', () => {
      const stream = `
        % Full Bezier
        10 10 m
        20 30 40 30 50 10 c
        S

        % Bezier v (initial control point is current point)
        10 10 m
        30 30 50 10 v
        S

        % Bezier y (final control point is final point)
        10 10 m
        30 30 50 10 y
        S

        % Rectangle primitive
        100 150 80 40 re
        B
      `;

      const result = parseContentStreamVectors(stream);

      // Beziers
      expect(result.beziers).toHaveLength(3);

      // c
      expect(result.beziers[0].p0).toEqual({ x: 10, y: 10 });
      expect(result.beziers[0].p1).toEqual({ x: 20, y: 30 });
      expect(result.beziers[0].p2).toEqual({ x: 40, y: 30 });
      expect(result.beziers[0].p3).toEqual({ x: 50, y: 10 });

      // v
      expect(result.beziers[1].p0).toEqual({ x: 10, y: 10 });
      expect(result.beziers[1].p1).toEqual({ x: 10, y: 10 }); // p1 == currentPoint
      expect(result.beziers[1].p2).toEqual({ x: 30, y: 30 });
      expect(result.beziers[1].p3).toEqual({ x: 50, y: 10 });

      // y
      expect(result.beziers[2].p0).toEqual({ x: 10, y: 10 });
      expect(result.beziers[2].p1).toEqual({ x: 30, y: 30 });
      expect(result.beziers[2].p2).toEqual({ x: 50, y: 10 }); // p2 == p3
      expect(result.beziers[2].p3).toEqual({ x: 50, y: 10 });

      // Rectangles
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].x).toBe(100);
      expect(result.rectangles[0].y).toBe(150);
      expect(result.rectangles[0].width).toBe(80);
      expect(result.rectangles[0].height).toBe(40);

      // Rectangles also generate a 4-line closed subpath painted with 'fill-and-stroke' (B)
      expect(result.paths[3].paintingOp).toBe('fill-and-stroke');
      expect(result.lines).toHaveLength(4);
    });

    it('FALSIFY-VEC-05: parses RGB, CMYK, Gray colors and multiple painting operators', () => {
      const stream = `
        % RGB stroke, CMYK fill
        0.2 0.4 0.8 RG
        0.1 0.2 0.3 0.4 k
        10 10 m 20 20 l B
        
        % Even-odd fill
        0.9 0.1 0.1 rg
        30 30 m 40 40 l f*

        % Close, even-odd fill and stroke
        0.2 G
        50 50 m 60 60 l b*

        % Clip path (n)
        70 70 m 80 80 l n
      `;

      const result = parseContentStreamVectors(stream);

      expect(result.paths).toHaveLength(4);
      expect(result.paths[0].paintingOp).toBe('fill-and-stroke');
      expect(result.paths[0].strokeColor).toBe('#3366cc');

      expect(result.paths[1].paintingOp).toBe('fill-even-odd');
      expect(result.paths[1].fillColor).toBe('#e61a1a');

      expect(result.paths[2].paintingOp).toBe('fill-and-stroke-even-odd');
      expect(result.paths[2].strokeColor).toBe('#333333');

      expect(result.paths[3].paintingOp).toBe('clip-only');
    });

    it('handles comments, string literals, and extraneous tokens gracefully without corrupted operands', () => {
      const stream = `
        % Header comment
        /DeviceRGB cs
        [1 2 3] 0 d
        (Ignored string with parentheses \\(nested\\)) Tj
        <48656c6c6f> Tj
        2.5 w
        15.5 25.5 m
        115.5 225.5 l
        S
      `;

      const result = parseContentStreamVectors(stream);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].strokeWidth).toBe(2.5);
      expect(result.lines[0].start).toEqual({ x: 15.5, y: 25.5 });
      expect(result.lines[0].end).toEqual({ x: 115.5, y: 225.5 });
    });
  });
});
