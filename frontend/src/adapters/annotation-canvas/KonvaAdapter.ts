import Konva from 'konva';
import type { PdfAnnotation } from '@/core/annotations/types';
import { deserializeKonvaNodeToAnnotation, serializeAnnotationToKonvaConfig } from './serializer';

interface SerializedKonvaChild {
  attrs: Record<string, unknown> & { id: string };
  className: string;
}

interface SerializedKonvaLayer {
  children: SerializedKonvaChild[];
}

function readStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readPointArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;
  if (value.length < 4 || value.length % 2 !== 0) return null;
  return [...value];
}

function pointsFitLocalBounds(points: number[], width: number, height: number): boolean {
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < 0 || y < 0 || x > width || y > height) {
      return false;
    }
  }
  return true;
}

export function toLocalAnnotationPoints(points: number[], originX: number, originY: number, width: number, height: number): number[] {
  if (pointsFitLocalBounds(points, width, height)) {
    return [...points];
  }

  return points.map((value, index) => (index % 2 === 0 ? value - originX : value - originY));
}

function readInkPoints(annotation: PdfAnnotation, originX: number, originY: number, width: number, height: number): number[] {
  const pointsFromData = readPointArray(annotation.data.points);
  if (pointsFromData) return toLocalAnnotationPoints(pointsFromData, originX, originY, width, height);

  if (Array.isArray(annotation.data.paths)) {
    for (const stroke of annotation.data.paths) {
      const strokePoints = readPointArray(stroke);
      if (strokePoints) return toLocalAnnotationPoints(strokePoints, originX, originY, width, height);
    }
  }

  return [0, height / 2, width, height / 2];
}

function normalizePolygonPoints(
  rawPoints: unknown,
  originX: number,
  originY: number,
  width: number,
  height: number,
): number[] {
  const points = readPointArray(rawPoints);
  if (!points) {
    return [width / 2, 0, width, height, 0, height];
  }

  return toLocalAnnotationPoints(points, originX, originY, width, height);
}

function readLinePoints(annotation: PdfAnnotation, originX: number, originY: number, width: number, height: number): number[] {
  const points = readPointArray(annotation.data.points);
  if (!points) return [0, height / 2, width, height / 2];
  return toLocalAnnotationPoints(points, originX, originY, width, height);
}

function buildSquigglyPoints(width: number, height: number): number[] {
  const points: number[] = [];
  const step = 6;
  for (let x = 0; x <= width; x += step) {
    const offset = x % (step * 2) === 0 ? -2 : 2;
    points.push(x, height + offset);
  }
  return points;
}

export class KonvaAdapter {
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;

  initStage(container: HTMLDivElement, width: number, height: number): Konva.Stage {
    this.stage = new Konva.Stage({
      container,
      width,
      height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Prevent the default scrolling behavior when interacting with canvas
    container.style.touchAction = 'none';

    return this.stage;
  }

  addObject(annotation: PdfAnnotation): Konva.Shape | null {
    if (!this.layer) return null;

    let node: Konva.Shape;
    const config = serializeAnnotationToKonvaConfig(annotation);
    const strokeColor = readStringValue(annotation.data.borderColor, '#3b82f6');
    const fillColor = readStringValue(annotation.data.backgroundColor, 'transparent');
    const borderWidth = readNumberValue(annotation.data.borderWidth, 2);
    const opacity = readNumberValue(annotation.data.opacity, 1);
    const textColor = readStringValue(annotation.data.textColor, '#111827');
    const textValue = readStringValue(annotation.data.text, 'Text');
    const width = readNumberValue(config.width, 120);
    const height = readNumberValue(config.height, 48);
    const x = readNumberValue(config.x, 0);
    const y = readNumberValue(config.y, 0);

    // Choose correct Konva Node based on the annotation type
    switch (annotation.type) {
      case 'textbox':
        node = new Konva.Text({
          ...config,
          text: textValue,
          fill: textColor,
          fontSize: readNumberValue(annotation.data.fontSize, 16),
        });
        break;
      case 'highlight':
        node = new Konva.Rect({ ...config, fill: '#fde047', opacity: readNumberValue(annotation.data.opacity, 0.4) });
        break;
      case 'underline':
        node = new Konva.Line({
          ...config,
          points: [0, height, width, height],
          stroke: strokeColor,
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'strikeout':
        node = new Konva.Line({
          ...config,
          points: [0, height / 2, width, height / 2],
          stroke: strokeColor,
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'squiggly':
        node = new Konva.Line({
          ...config,
          points: buildSquigglyPoints(width, height),
          stroke: strokeColor,
          strokeWidth: readNumberValue(annotation.data.borderWidth, 1.5),
          tension: 0.35,
          opacity,
        });
        break;
      case 'shape-rect':
        node = new Konva.Rect({
          ...config,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'shape-ellipse':
        node = new Konva.Ellipse({
          ...config,
          x: x + width / 2,
          y: y + height / 2,
          radiusX: width / 2,
          radiusY: height / 2,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'shape-polygon':
        node = new Konva.Line({
          ...config,
          points: normalizePolygonPoints(annotation.data.points, x, y, width, height),
          closed: true,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'shape-cloud':
        node = new Konva.Rect({
          ...config,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: borderWidth,
          dash: [6, 4],
          cornerRadius: 10,
          opacity,
        });
        break;
      case 'ink':
        node = new Konva.Line({
          ...config,
          points: readInkPoints(annotation, x, y, width, height),
          stroke: readStringValue(annotation.data.borderColor, '#111827'),
          strokeWidth: borderWidth,
          tension: 0.4,
          lineCap: 'round',
          lineJoin: 'round',
          opacity,
        });
        break;
      case 'line':
        node = new Konva.Line({
          ...config,
          points: readLinePoints(annotation, x, y, width, height),
          stroke: readStringValue(annotation.data.borderColor, '#111827'),
          strokeWidth: borderWidth,
          opacity,
        });
        break;
      case 'arrow':
        node = new Konva.Arrow({
          ...config,
          points: readLinePoints(annotation, x, y, width, height),
          stroke: readStringValue(annotation.data.borderColor, '#111827'),
          strokeWidth: borderWidth,
          pointerLength: 8,
          pointerWidth: 6,
          fill: readStringValue(annotation.data.borderColor, '#111827'),
          opacity,
        });
        break;
      case 'callout':
        node = new Konva.Rect({
          ...config,
          stroke: readStringValue(annotation.data.borderColor, '#475569'),
          strokeWidth: 1.5,
          fill: readStringValue(annotation.data.backgroundColor, '#ffffff'),
          cornerRadius: 4,
          opacity,
        });
        break;
      case 'sticky-note': {
        const isCollapsed = annotation.data.isCollapsed !== false;
        if (isCollapsed) {
          node = new Konva.Circle({
            ...config,
            x: x + width / 2,
            y: y + height / 2,
            radius: Math.min(width, height) / 2,
            fill: readStringValue(annotation.data.backgroundColor, '#fde047'),
            stroke: readStringValue(annotation.data.borderColor, '#facc15'),
            strokeWidth: 1.5,
            opacity,
          });
          break;
        }

        node = new Konva.Rect({
          ...config,
          fill: readStringValue(annotation.data.backgroundColor, '#fef9c3'),
          stroke: readStringValue(annotation.data.borderColor, '#fde047'),
          strokeWidth: 1.5,
          cornerRadius: 6,
          opacity,
        });
        break;
      }
      case 'stamp':
        node = new Konva.Rect({
          ...config,
          fill: readStringValue(annotation.data.backgroundColor, '#fef2f2'),
          stroke: readStringValue(annotation.data.borderColor, '#ef4444'),
          strokeWidth: borderWidth,
          dash: [4, 2],
          cornerRadius: 4,
          opacity,
        });
        break;
      case 'comment':
        node = new Konva.Rect({
          ...config,
          fill: readStringValue(annotation.data.backgroundColor, '#fff7cc'),
          stroke: readStringValue(annotation.data.borderColor, '#d4b106'),
          strokeWidth: 1.5,
          cornerRadius: 6,
          opacity,
        });
        break;
      case 'redaction':
        node = new Konva.Rect({
          ...config,
          fill: '#000000',
          stroke: '#000000',
          strokeWidth: 2,
          opacity: 1,
        });
        break;
      default: {
        const unknownType = (annotation as { type: string }).type;
        void import('@/core/logger/service').then(({ warn }) => {
          warn('annotation', 'Fallback renderer used — type not implemented in KonvaAdapter', {
            type: unknownType,
            id: annotation.id,
            pageNumber: annotation.pageNumber,
          });
        });
        node = new Konva.Rect({
          ...config,
          fill: '#fef9c3',
          stroke: '#f59e0b',
          strokeWidth: 2,
          dash: [3, 3],
          opacity: 0.7,
        });
        break;
      }
    }

    // Add draggable capability for editor mode
    node.draggable(true);

    this.layer.add(node);
    this.layer.draw();
    return node;
  }

  removeObject(id: string): void {
    if (!this.layer) return;
    const node = this.layer.findOne(`#${id}`);
    if (node) {
      node.destroy();
      this.layer.draw();
    }
  }

  serialize(pageNumber: number): PdfAnnotation[] {
    if (!this.layer) return [];

    // Konva.Layer().toJSON() provides children
    const layerJSON = JSON.parse(this.layer.toJSON()) as SerializedKonvaLayer;
    const annotations: PdfAnnotation[] = layerJSON.children.map((child) => {
      const { attrs, className } = child;
      const baseObj = deserializeKonvaNodeToAnnotation(attrs, className);
      return {
        ...baseObj,
        id: attrs.id,
        pageNumber,
        createdAt: Date.now(),
        updatedAt: Date.now()
      } as PdfAnnotation;
    });

    return annotations;
  }

  deserialize(annotations: PdfAnnotation[]): void {
    if (!this.layer) return;
    this.layer.destroyChildren(); // clear
    annotations.forEach(ann => this.addObject(ann));
    this.layer.draw();
  }
}
