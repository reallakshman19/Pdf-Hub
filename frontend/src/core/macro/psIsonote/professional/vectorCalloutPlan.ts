import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PdfPoint,
  type PsIsonotePlannedCallout,
  type PsIsonoteProfessionalStyle,
  type PsIsonoteVectorPrimitive,
  type PsIsonoteVectorRenderPlan,
  type TextMetricsProvider,
} from './model';
import { layoutCalloutTypography } from './typography';

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function validatePoint(point: PdfPoint, label: string): void {
  requireFinite(point.x, `${label}.x`);
  requireFinite(point.y, `${label}.y`);
}

function validateCallout(callout: PsIsonotePlannedCallout): void {
  if (!callout.content.psNo.trim()) throw new Error('Callout PS number is required.');
  if (!callout.content.isonote.trim()) throw new Error('Callout ISONOTE is required.');
  if (callout.pageNumber < 1 || !Number.isInteger(callout.pageNumber)) {
    throw new Error('Callout pageNumber must be a positive integer.');
  }

  requireFinite(callout.box.x, 'box.x');
  requireFinite(callout.box.y, 'box.y');
  requireFinite(callout.box.width, 'box.width');
  requireFinite(callout.box.height, 'box.height');
  if (callout.box.width <= 0 || callout.box.height <= 0) {
    throw new Error('Callout box dimensions must be positive.');
  }

  validatePoint(callout.anchor, 'anchor');
  if (callout.leader.points.length < 2) {
    throw new Error('Callout leader requires at least two points.');
  }
  callout.leader.points.forEach((point, index) => validatePoint(point, `leader.points[${index}]`));
}

function statusText(callout: PsIsonotePlannedCallout): string | undefined {
  if (callout.content.statusLabel?.trim()) return callout.content.statusLabel.trim();
  if (callout.quality === 'review') return 'REVIEW';
  if (callout.quality === 'manual') return 'MANUAL';
  return undefined;
}

function linePrimitives(
  callout: PsIsonotePlannedCallout,
  color: string,
  width: number,
): PsIsonoteVectorPrimitive[] {
  const primitives: PsIsonoteVectorPrimitive[] = [];
  for (let index = 0; index < callout.leader.points.length - 1; index += 1) {
    primitives.push({
      type: 'line',
      from: callout.leader.points[index],
      to: callout.leader.points[index + 1],
      color,
      width,
    });
  }
  return primitives;
}

export function buildPsIsonoteVectorRenderPlan(options: {
  callout: PsIsonotePlannedCallout;
  metrics: TextMetricsProvider;
  style?: PsIsonoteProfessionalStyle;
}): PsIsonoteVectorRenderPlan {
  const style = options.style ?? DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE;
  const callout = options.callout;
  validateCallout(callout);

  if (callout.styleVersion !== style.styleVersion) {
    throw new Error(
      `Callout style version ${callout.styleVersion} does not match renderer style ${style.styleVersion}.`,
    );
  }

  const status = statusText(callout);
  const typography = layoutCalloutTypography({
    psNo: callout.content.psNo,
    isonote: callout.content.isonote,
    ...(callout.content.family ? { family: callout.content.family } : {}),
    ...(status ? { statusLabel: status } : {}),
    width: callout.box.width,
    paddingX: style.paddingX,
    paddingY: style.paddingY,
    headerFontSize: style.headerFontSize,
    noteFontSize: style.noteFontSize,
    secondaryFontSize: style.secondaryFontSize,
    lineHeight: style.lineHeight,
    metrics: options.metrics,
  });

  if (typography.height > callout.box.height) {
    throw new Error(
      `Callout box height ${callout.box.height} is smaller than required typography height ${typography.height}.`,
    );
  }

  const isReview = callout.quality === 'review' || callout.quality === 'unplaceable';
  const strokeColor = isReview ? style.reviewBorderColor : style.borderColor;
  const leaderColor = isReview ? style.reviewLeaderColor : style.leaderColor;
  const usableWidth = Math.max(20, callout.box.width - style.paddingX * 2);
  const left = callout.box.x + style.paddingX;
  const right = callout.box.x + callout.box.width - style.paddingX;
  let baselineY = callout.box.y + style.paddingY + style.headerFontSize;

  const primitives: PsIsonoteVectorPrimitive[] = [
    ...linePrimitives(callout, leaderColor, style.leaderWidth),
    {
      type: 'circle',
      center: callout.anchor,
      radius: callout.leader.anchorRadius || style.anchorRadius,
      strokeColor: leaderColor,
      strokeWidth: style.leaderWidth,
      fillColor: style.backgroundColor,
    },
    {
      type: 'rectangle',
      rect: callout.box,
      fillColor: style.backgroundColor,
      fillOpacity: style.backgroundOpacity,
      strokeColor,
      strokeWidth: style.borderWidth,
    },
    {
      type: 'text',
      position: { x: left, y: baselineY },
      text: typography.headerLine.text,
      fontSize: style.headerFontSize,
      weight: 'bold',
      color: style.textColor,
      maxWidth: usableWidth,
    },
  ];

  if (typography.familyLine) {
    baselineY += style.secondaryFontSize * style.lineHeight;
    primitives.push({
      type: 'text',
      position: { x: left, y: baselineY },
      text: typography.familyLine.text,
      fontSize: style.secondaryFontSize,
      weight: 'regular',
      color: style.secondaryTextColor,
      maxWidth: usableWidth,
    });
  }

  if (typography.statusLine) {
    const statusX = Math.max(left, right - typography.statusLine.width);
    primitives.push({
      type: 'text',
      position: { x: statusX, y: callout.box.y + style.paddingY + style.secondaryFontSize },
      text: typography.statusLine.text,
      fontSize: style.secondaryFontSize,
      weight: 'bold',
      color: strokeColor,
      maxWidth: usableWidth,
    });
  }

  baselineY += style.noteFontSize * style.lineHeight * 0.9;
  for (const line of typography.noteLines) {
    primitives.push({
      type: 'text',
      position: { x: left, y: baselineY },
      text: line.text,
      fontSize: style.noteFontSize,
      weight: 'regular',
      color: style.textColor,
      maxWidth: usableWidth,
    });
    baselineY += style.noteFontSize * style.lineHeight;
  }

  return {
    pageNumber: callout.pageNumber,
    identity: {
      psNo: callout.psNo,
      pageNumber: callout.pageNumber,
      mappingHash: callout.mappingHash,
      occurrenceId: callout.occurrenceId,
    },
    bounds: callout.box,
    primitives,
    visibleText: [
      typography.headerLine.text,
      ...(typography.familyLine ? [typography.familyLine.text] : []),
      ...(typography.statusLine ? [typography.statusLine.text] : []),
      ...typography.noteLines.map((line) => line.text),
    ],
    styleVersion: style.styleVersion,
  };
}
