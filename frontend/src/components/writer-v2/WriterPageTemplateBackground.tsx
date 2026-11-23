import React from 'react';
import type {
  WriterPageSetupV2,
  WriterPageTemplateOptions,
} from '@/core/writer-v2/types';
import {
  calculateCornellLayout,
  calculateDotGridPoints,
  calculateGridLines,
  calculateMusicStaffs,
  calculateRuledLines,
  normalizeTemplateOptions,
  resolvePageTemplate,
} from '@/core/writer-v2/templates/pageTemplates';

export interface WriterPageTemplateBackgroundProps {
  pageSetup: WriterPageSetupV2;
  pageIndex?: number;
  template?: WriterPageTemplateOptions;
  scale?: number;
  className?: string;
}

export const WriterPageTemplateBackground: React.FC<WriterPageTemplateBackgroundProps> = ({
  pageSetup,
  pageIndex = 0,
  template: templateProp,
  className,
}) => {
  const template = React.useMemo(() => {
    if (templateProp) {
      return normalizeTemplateOptions(templateProp);
    }
    return resolvePageTemplate(pageSetup, pageIndex);
  }, [pageSetup, pageIndex, templateProp]);

  if (template.kind === 'blank') {
    return null;
  }

  const {
    width,
    height,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
  } = pageSetup;

  return (
    <svg
      data-testid="writer-page-template-background"
      data-template-kind={template.kind}
      aria-hidden="true"
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {renderTemplateContent({
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
      })}
    </svg>
  );
};

interface RenderTemplateContentInput {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  template: WriterPageTemplateOptions;
}

function renderTemplateContent(input: RenderTemplateContentInput): React.ReactNode {
  const {
    width,
    height,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    template,
  } = input;

  const lineColor = template.lineColor ?? '#cbd5e1';
  const lineWidth = template.lineWidth ?? 0.75;

  switch (template.kind) {
    case 'ruled': {
      const geometry = calculateRuledLines(
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
      );

      return (
        <g data-testid="template-ruled-group">
          {geometry.lines.map((line, idx) => (
            <line
              key={`ruled-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={lineWidth}
              shapeRendering="crispEdges"
              data-testid="template-ruled-line"
            />
          ))}
          {geometry.marginLine ? (
            <line
              x1={geometry.marginLine.x1}
              y1={geometry.marginLine.y1}
              x2={geometry.marginLine.x2}
              y2={geometry.marginLine.y2}
              stroke={template.marginLineColor ?? '#fca5a5'}
              strokeWidth={1}
              shapeRendering="crispEdges"
              data-testid="template-ruled-margin-line"
            />
          ) : null}
        </g>
      );
    }

    case 'grid': {
      const geometry = calculateGridLines(
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
        true,
      );

      return (
        <g data-testid="template-grid-group">
          {geometry.horizontalLines.map((line, idx) => (
            <line
              key={`gh-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={lineWidth}
              shapeRendering="crispEdges"
              data-testid="template-grid-line"
            />
          ))}
          {geometry.verticalLines.map((line, idx) => (
            <line
              key={`gv-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={lineWidth}
              shapeRendering="crispEdges"
              data-testid="template-grid-line"
            />
          ))}
        </g>
      );
    }

    case 'dot-grid': {
      const points = calculateDotGridPoints(
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
        true,
      );
      const radius = (template.dotSize ?? 1.5) / 2;

      return (
        <g data-testid="template-dot-grid-group">
          {points.map((pt, idx) => (
            <circle
              key={`dot-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r={radius}
              fill={lineColor}
              data-testid="template-dot"
            />
          ))}
        </g>
      );
    }

    case 'cornell': {
      const geometry = calculateCornellLayout(
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
      );

      const dividerColor = template.marginLineColor ?? '#94a3b8';

      return (
        <g data-testid="template-cornell-group">
          {/* Header line */}
          <line
            x1={geometry.headerLine.x1}
            y1={geometry.headerLine.y1}
            x2={geometry.headerLine.x2}
            y2={geometry.headerLine.y2}
            stroke={dividerColor}
            strokeWidth={1.25}
            shapeRendering="crispEdges"
            data-testid="template-cornell-header-line"
          />
          {/* Summary line */}
          <line
            x1={geometry.summaryLine.x1}
            y1={geometry.summaryLine.y1}
            x2={geometry.summaryLine.x2}
            y2={geometry.summaryLine.y2}
            stroke={dividerColor}
            strokeWidth={1.25}
            shapeRendering="crispEdges"
            data-testid="template-cornell-summary-line"
          />
          {/* Cue divider line */}
          <line
            x1={geometry.cueDividerLine.x1}
            y1={geometry.cueDividerLine.y1}
            x2={geometry.cueDividerLine.x2}
            y2={geometry.cueDividerLine.y2}
            stroke={dividerColor}
            strokeWidth={1.25}
            shapeRendering="crispEdges"
            data-testid="template-cornell-cue-line"
          />
          {/* Notes ruled lines */}
          {geometry.ruledLines.map((line, idx) => (
            <line
              key={`cornell-ruled-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={lineColor}
              strokeWidth={lineWidth}
              shapeRendering="crispEdges"
              data-testid="template-cornell-ruled-line"
            />
          ))}
        </g>
      );
    }

    case 'music-staff': {
      const staffs = calculateMusicStaffs(
        width,
        height,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        template,
      );

      return (
        <g data-testid="template-music-staff-group">
          {staffs.map((staff) => (
            <g key={`staff-${staff.staffIndex}`} data-testid="template-music-staff">
              {staff.lines.map((line, lineIdx) => (
                <line
                  key={`staff-${staff.staffIndex}-line-${lineIdx}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={lineColor}
                  strokeWidth={lineWidth}
                  shapeRendering="crispEdges"
                  data-testid="template-staff-line"
                />
              ))}
            </g>
          ))}
        </g>
      );
    }

    default:
      return null;
  }
}
