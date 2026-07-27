import {
  type BoxPlacement,
  type PdfFontId,
  type Point,
  type ProfessionalCalloutContent,
  type ProfessionalCalloutModel,
  type Rect,
  type StyleContract,
  type StyleContractInput,
  type VectorLine,
  type VectorPrimitive,
  type VectorText,
  getStyleContract,
} from './model';
import {
  type BoxDimensions,
  calculateCalloutBoxDimensions,
} from './typography';

const ANCHOR_INSET = 4;

export interface VectorCalloutPlanInput {
  readonly id: string;
  readonly psNo: string;
  readonly content: ProfessionalCalloutContent;
  readonly targetPoint: Point;
  readonly boxPlacement: BoxPlacement;
  readonly style: StyleContractInput;
  readonly leaderRoute?: readonly [Point, Point, ...Point[]];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getBoxAnchorTowards(box: Rect, target: Point): Point {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dx = target.x - centerX;
  const dy = target.y - centerY;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: dx > 0 ? box.x + box.width : box.x,
      y: clamp(target.y, box.y + ANCHOR_INSET, box.y + box.height - ANCHOR_INSET),
    };
  }
  return {
    x: clamp(target.x, box.x + ANCHOR_INSET, box.x + box.width - ANCHOR_INSET),
    y: dy > 0 ? box.y + box.height : box.y,
  };
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function validateLeaderRoute(route: readonly Point[], target: Point): void {
  if (route.length < 2) throw new Error('leaderRoute must contain at least two points.');
  route.forEach((point, index) => {
    assertFinite(point.x, `leaderRoute[${index}].x`);
    assertFinite(point.y, `leaderRoute[${index}].y`);
  });
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    if (!start || !end || pointsEqual(start, end)) {
      throw new Error('leaderRoute segments must have non-zero length.');
    }
    if (start.x !== end.x && start.y !== end.y) {
      throw new Error('leaderRoute segments must be exactly horizontal or vertical.');
    }
  }
  const finalPoint = route[route.length - 1];
  if (!finalPoint || !pointsEqual(finalPoint, target)) {
    throw new Error('leaderRoute must terminate at targetPoint.');
  }
}

function validateInput(input: VectorCalloutPlanInput): void {
  assertFinite(input.targetPoint.x, 'targetPoint.x');
  assertFinite(input.targetPoint.y, 'targetPoint.y');
  assertFinite(input.boxPlacement.x, 'boxPlacement.x');
  assertFinite(input.boxPlacement.y, 'boxPlacement.y');
  if (!Number.isFinite(input.boxPlacement.width) || input.boxPlacement.width <= 0) {
    throw new RangeError('boxPlacement.width must be a positive finite number.');
  }
  if (input.leaderRoute) validateLeaderRoute(input.leaderRoute, input.targetPoint);
}

function copyContent(content: ProfessionalCalloutContent): ProfessionalCalloutContent {
  return {
    ...(content.tagValue !== undefined ? { tagValue: content.tagValue } : {}),
    ...(content.isoNoteValue !== undefined ? { isoNoteValue: content.isoNoteValue } : {}),
    ...(content.confidence !== undefined ? { confidence: content.confidence } : {}),
  };
}

function createLeaderLines(
  box: Rect,
  target: Point,
  style: StyleContract,
  route?: readonly [Point, Point, ...Point[]],
): readonly VectorLine[] {
  const points: readonly Point[] = route ?? [getBoxAnchorTowards(box, target), target];
  const lines: VectorLine[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    lines.push({
      type: 'line',
      start: { ...start },
      end: { ...end },
      color: style.leaderColor,
      width: 1,
      style: 'solid',
    });
  }
  return lines;
}

function createGeometryPrimitives(
  box: Rect,
  target: Point,
  style: StyleContract,
  route?: readonly [Point, Point, ...Point[]],
): readonly VectorPrimitive[] {
  return [
    ...createLeaderLines(box, target, style, route),
    {
      type: 'circle',
      center: { ...target },
      radius: 2,
      fillColor: style.leaderColor,
      borderColor: style.leaderColor,
      borderWidth: 1,
    },
    {
      type: 'rectangle',
      rect: { ...box },
      fillColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
      cornerRadius: style.cornerRadius,
    },
  ];
}

function createTextLines(
  lines: readonly string[],
  fontId: PdfFontId,
  startY: number,
  box: Rect,
  style: StyleContract,
): readonly VectorText[] {
  return lines.map((text, index) => ({
    type: 'text',
    position: { x: box.x + style.padding, y: startY + index * style.lineHeight },
    text,
    fontSize: style.fontSize,
    fontId,
    color: style.textColor,
  }));
}

function createTextPrimitives(
  box: Rect,
  dimensions: BoxDimensions,
  style: StyleContract,
): readonly VectorText[] {
  const firstBaseline = box.y + style.padding + style.fontSize;
  const tagText = createTextLines(
    dimensions.tagLines,
    style.tagFontId,
    firstBaseline,
    box,
    style,
  );
  const noteStart = firstBaseline
    + dimensions.tagLines.length * style.lineHeight
    + dimensions.sectionGap;
  const noteText = createTextLines(
    dimensions.noteLines,
    style.bodyFontId,
    noteStart,
    box,
    style,
  );
  return [...tagText, ...noteText];
}

export function buildVectorCalloutPlan(
  input: VectorCalloutPlanInput,
): ProfessionalCalloutModel {
  validateInput(input);
  const style = getStyleContract(input.style);
  const dimensions = calculateCalloutBoxDimensions(
    input.content,
    input.boxPlacement.width,
    style,
  );
  const targetPoint = { ...input.targetPoint };
  const box: Rect = {
    x: input.boxPlacement.x,
    y: input.boxPlacement.y,
    width: dimensions.width,
    height: dimensions.height,
  };

  return {
    id: input.id,
    psNo: input.psNo,
    content: copyContent(input.content),
    targetPoint,
    box,
    style,
    primitives: [
      ...createGeometryPrimitives(box, targetPoint, style, input.leaderRoute),
      ...createTextPrimitives(box, dimensions, style),
    ],
  };
}
