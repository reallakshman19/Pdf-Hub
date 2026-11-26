import type { CadExtrudedMesh3D, Point3D } from './types';

export interface Camera3D {
  azimuthDeg: number; // Horizontal rotation [0, 360)
  elevationDeg: number; // Vertical tilt [-89, 89]
  distance: number; // Distance from target
  target: Point3D; // Pivot center
  panOffset: { x: number; y: number };
}

export interface SceneRenderMeshItem {
  id: string;
  mesh: CadExtrudedMesh3D;
  color?: string;
  highlightSeverity?: 'hard' | 'clearance' | 'selected' | null;
}

export interface Render3DOptions {
  viewMode?: 'shaded' | 'wireframe' | 'xray';
  shadedColor?: string;
  wireframeColor?: string;
  drawGroundGrid?: boolean;
  pivotCenter?: Point3D;
}

export const DEFAULT_CAMERA_3D: Camera3D = {
  azimuthDeg: 45,
  elevationDeg: 30,
  distance: 300,
  target: { x: 0, y: 0, z: 0 },
  panOffset: { x: 0, y: 0 },
};

export function resolveItemEffectiveColor(
  item: SceneRenderMeshItem,
  fallbackColor: string,
): string {
  if (item.highlightSeverity === 'hard') return '#ef4444';
  if (item.highlightSeverity === 'clearance') return '#f59e0b';
  if (item.highlightSeverity === 'selected') return '#facc15';
  return item.color ?? fallbackColor;
}

export function computeScenePivotAndSpan(items: SceneRenderMeshItem[]): {
  pivot: Point3D;
  span: number;
} {
  if (items.length === 0) {
    return { pivot: { x: 0, y: 0, z: 0 }, span: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const item of items) {
    const b = item.mesh.bounds;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
  }

  return {
    pivot: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    },
    span: Math.max(20, maxX - minX, maxY - minY, maxZ - minZ),
  };
}

/**
 * Renders an extruded 3D mesh to an HTML5 Canvas 2D context using software 3D projection,
 * depth sorting, and directional lighting.
 */
export function renderMeshToCanvas2D(
  ctx: CanvasRenderingContext2D,
  mesh: CadExtrudedMesh3D,
  camera: Camera3D,
  options: Render3DOptions = {},
): void {
  renderSceneMeshesToCanvas2D(
    ctx,
    [{ id: mesh.id, mesh }],
    camera,
    {
      ...options,
      pivotCenter: options.pivotCenter ?? mesh.centroid,
    },
  );
}

/**
 * Renders one or more 3D meshes in a shared world coordinate system using depth-sorted
 * triangles, per-part material colors, and clash highlight overrides.
 */
export function renderSceneMeshesToCanvas2D(
  ctx: CanvasRenderingContext2D,
  items: SceneRenderMeshItem[],
  camera: Camera3D,
  options: Render3DOptions = {},
): void {
  if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.beginPath !== 'function') {
    return;
  }

  const width = ctx.canvas?.width ?? 380;
  const height = ctx.canvas?.height ?? 320;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  const viewMode = options.viewMode ?? 'shaded';
  const defaultShadedColor = options.shadedColor ?? '#3b82f6';
  const defaultWireColor = options.wireframeColor ?? '#38bdf8';

  const azRad = (camera.azimuthDeg * Math.PI) / 180;
  const elRad = (camera.elevationDeg * Math.PI) / 180;

  const cosAz = Math.cos(azRad);
  const sinAz = Math.sin(azRad);
  const cosEl = Math.cos(elRad);
  const sinEl = Math.sin(elRad);

  const cx = width / 2 + camera.panOffset.x;
  const cy = height / 2 + camera.panOffset.y;
  const { pivot, span } = computeScenePivotAndSpan(items);
  const target =
    options.pivotCenter ??
    (camera.target.x !== 0 || camera.target.y !== 0 || camera.target.z !== 0
      ? camera.target
      : pivot);

  const effectiveDistance = Math.max(camera.distance, 10);
  const fov = Math.max(width, height) * 0.9;

  if (options.drawGroundGrid) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridStep = Math.max(20, Math.round(span / 8));
    const gridCount = 4;
    for (let g = -gridCount; g <= gridCount; g++) {
      const gz0 = g * gridStep;
      const p1rx = cosAz * (-gridCount * gridStep) - sinAz * gz0;
      const p1ry = sinAz * (-gridCount * gridStep) + cosAz * gz0;
      const p1ez = sinEl * p1ry + cosEl * 0 + effectiveDistance;
      const s1 = p1ez > 1 ? fov / p1ez : 1;

      const p2rx = cosAz * (gridCount * gridStep) - sinAz * gz0;
      const p2ry = sinAz * (gridCount * gridStep) + cosAz * gz0;
      const p2ez = sinEl * p2ry + cosEl * 0 + effectiveDistance;
      const s2 = p2ez > 1 ? fov / p2ez : 1;

      ctx.moveTo(cx + p1rx * s1, cy - (cosEl * p1ry) * s1);
      ctx.lineTo(cx + p2rx * s2, cy - (cosEl * p2ry) * s2);
    }
    ctx.stroke();
  }

  const lightVec = { x: 0.577, y: 0.577, z: 0.577 };

  interface ProjectedTriangle {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    avgZ: number;
    dotProduct: number;
    fillColor: string;
    wireColor: string;
    highlighted: boolean;
  }

  const triangles: ProjectedTriangle[] = [];

  for (const item of items) {
    const mesh = item.mesh;
    const verts = mesh.vertices;
    const vertexCount = mesh.vertexCount;
    const screenX = new Float32Array(vertexCount);
    const screenY = new Float32Array(vertexCount);
    const camZ = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const x = verts[i * 3] - target.x;
      const y = verts[i * 3 + 1] - target.y;
      const z = verts[i * 3 + 2] - target.z;

      const rx = cosAz * x - sinAz * y;
      const ry = sinAz * x + cosAz * y;
      const rz = z;

      const ey = cosEl * rz - sinEl * ry;
      const ez = sinEl * rz + cosEl * ry + effectiveDistance;

      camZ[i] = ez;
      const scale = ez > 1 ? fov / ez : 1;
      screenX[i] = cx + rx * scale;
      screenY[i] = cy - ey * scale;
    }

    const fillColor = resolveItemEffectiveColor(item, defaultShadedColor);
    const wireColor = item.highlightSeverity ? fillColor : defaultWireColor;
    const highlighted = Boolean(item.highlightSeverity);

    const indices = mesh.indices;
    for (let t = 0; t < mesh.triangleCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      const avgZ = (camZ[i0] + camZ[i1] + camZ[i2]) / 3;
      const x0 = screenX[i0];
      const y0 = screenY[i0];
      const x1 = screenX[i1];
      const y1 = screenY[i1];
      const x2 = screenX[i2];
      const y2 = screenY[i2];

      const cross2D = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      const nx = mesh.normals[i0 * 3];
      const ny = mesh.normals[i0 * 3 + 1];
      const nz = mesh.normals[i0 * 3 + 2];
      const dot = Math.max(0.15, Math.abs(nx * lightVec.x + ny * lightVec.y + nz * lightVec.z));

      triangles.push({
        x0,
        y0,
        x1,
        y1,
        x2,
        y2,
        avgZ,
        dotProduct: cross2D > 0 ? dot : Math.max(0.25, dot * 0.7),
        fillColor,
        wireColor,
        highlighted,
      });
    }
  }

  triangles.sort((a, b) => b.avgZ - a.avgZ);

  for (const tri of triangles) {
    ctx.beginPath();
    ctx.moveTo(tri.x0, tri.y0);
    ctx.lineTo(tri.x1, tri.y1);
    ctx.lineTo(tri.x2, tri.y2);
    ctx.closePath();

    if (viewMode === 'shaded') {
      const brightness = Math.min(1.0, Math.max(0.25, tri.dotProduct));
      ctx.fillStyle = tri.fillColor;
      ctx.globalAlpha = tri.highlighted ? Math.max(0.75, brightness) : brightness;
      ctx.fill();

      ctx.globalAlpha = tri.highlighted ? 0.65 : 0.22;
      ctx.strokeStyle = tri.highlighted ? '#ffffff' : '#e2e8f0';
      ctx.lineWidth = tri.highlighted ? 0.9 : 0.45;
      ctx.stroke();
    } else if (viewMode === 'wireframe') {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = tri.wireColor;
      ctx.lineWidth = tri.highlighted ? 1.4 : 0.9;
      ctx.stroke();
    } else if (viewMode === 'xray') {
      ctx.fillStyle = tri.fillColor;
      ctx.globalAlpha = tri.highlighted ? 0.55 : 0.25;
      ctx.fill();

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = tri.wireColor;
      ctx.lineWidth = tri.highlighted ? 1.3 : 0.85;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1.0;
}
