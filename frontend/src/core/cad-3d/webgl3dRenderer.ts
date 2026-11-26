import type { CadExtrudedMesh3D } from './types';
import {
  computeScenePivotAndSpan,
  resolveItemEffectiveColor,
  type Camera3D,
  type Render3DOptions,
  type SceneRenderMeshItem,
} from './software3dRenderer';
import { WebGlDisposalManager } from './webglDisposal';

export type SceneRenderOptions = Render3DOptions;

const VERTEX_SHADER_SRC = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform mat4 uViewProj;
  uniform vec3 uPivot;
  varying vec3 vNormal;
  void main() {
    vec3 p = aPosition - uPivot;
    vNormal = aNormal;
    gl_Position = uViewProj * vec4(p, 1.0);
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec3 vNormal;
  uniform vec4 uColor;
  uniform float uShaded;
  void main() {
    if (uShaded < 0.5) {
      gl_FragColor = uColor;
      return;
    }
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.577, 0.577, 0.577));
    float diff = max(abs(dot(n, lightDir)), 0.22);
    vec3 col = uColor.rgb * (0.35 + 0.65 * diff);
    gl_FragColor = vec4(col, uColor.a);
  }
`;

export function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [r, g, b, alpha];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b, alpha];
  }
  return [0.23, 0.51, 0.96, alpha];
}

/**
 * Computes column-major 4x4 camera projection matrix matching `Camera3D` azimuth/elevation/distance.
 */
export function buildCameraMatrix4(
  camera: Camera3D,
  width: number,
  height: number,
  near = 1,
  far = 100000,
): Float32Array {
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const fovRad = (45 * Math.PI) / 180;
  const f = 1 / Math.tan(fovRad / 2);

  const azRad = (camera.azimuthDeg * Math.PI) / 180;
  const elRad = (camera.elevationDeg * Math.PI) / 180;
  const cA = Math.cos(azRad);
  const sA = Math.sin(azRad);
  const cE = Math.cos(elRad);
  const sE = Math.sin(elRad);

  // Right-handed Z-up CAD orbit basis matching isometric X-East, Y-North, Z-Elevation:
  // R = (cA, -sA, 0)
  // U = (sE * sA, sE * cA, cE)
  // B = (-cE * sA, -cE * cA, sE)  [points back toward eye; R x U = B]
  const nf = 1 / (near - far);
  const p00 = f / aspect;
  const p11 = f;
  const p22 = (far + near) * nf;
  const p23 = 2 * far * near * nf;

  const r00 = cA;
  const r01 = -sA;
  const r02 = 0;

  const r10 = sE * sA;
  const r11 = sE * cA;
  const r12 = cE;

  const r20 = -cE * sA;
  const r21 = -cE * cA;
  const r22 = sE;

  const dist = Math.max(10, camera.distance);
  const tx = (camera.panOffset.x / Math.max(1, width)) * dist * 0.8;
  const ty = -(camera.panOffset.y / Math.max(1, height)) * dist * 0.8;
  const tz = -dist;

  // Multiply P * V (column-major out[col*4 + row])
  const out = new Float32Array(16);
  out[0] = p00 * r00;
  out[1] = p11 * r10;
  out[2] = p22 * r20;
  out[3] = -r20;

  out[4] = p00 * r01;
  out[5] = p11 * r11;
  out[6] = p22 * r21;
  out[7] = -r21;

  out[8] = p00 * r02;
  out[9] = p11 * r12;
  out[10] = p22 * r22;
  out[11] = -r22;

  out[12] = p00 * tx;
  out[13] = p11 * ty;
  out[14] = p22 * tz + p23;
  out[15] = -tz;

  return out;
}

interface UploadedGpuMesh {
  vbo: WebGLBuffer;
  nbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
}

/**
 * Zero-dependency hardware WebGL2/WebGL1 multi-mesh renderer wired to WebGlDisposalManager.
 */
export class WebGl3DRenderer {
  private readonly gl: WebGL2RenderingContext | WebGLRenderingContext;
  private readonly disposal: WebGlDisposalManager;
  private program: WebGLProgram | null = null;
  private uViewProjLoc: WebGLUniformLocation | null = null;
  private uPivotLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private uShadedLoc: WebGLUniformLocation | null = null;
  private aPositionLoc = -1;
  private aNormalLoc = -1;
  private readonly gpuCache = new Map<CadExtrudedMesh3D, UploadedGpuMesh>();
  private gridVbo: WebGLBuffer | null = null;
  private gridNbo: WebGLBuffer | null = null;

  private constructor(
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    disposal?: WebGlDisposalManager,
  ) {
    this.gl = gl;
    this.disposal = disposal ?? new WebGlDisposalManager(gl);
    this.disposal.bindContext(gl);
    this.initProgram();
  }

  public static tryCreate(
    canvas: HTMLCanvasElement,
    disposal?: WebGlDisposalManager,
  ): WebGl3DRenderer | null {
    try {
      const gl =
        (canvas.getContext('webgl2', { antialias: true, alpha: false }) as WebGL2RenderingContext | null) ??
        (canvas.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null);
      if (!gl) return null;
      return new WebGl3DRenderer(gl, disposal);
    } catch {
      return null;
    }
  }

  private compileShader(type: number, src: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Failed to create WebGL shader');
    this.disposal.trackShader(shader);
    this.gl.shaderSource(shader, src);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error';
      throw new Error(info);
    }
    return shader;
  }

  private initProgram(): void {
    const vs = this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    const prog = this.gl.createProgram();
    if (!prog) throw new Error('Failed to create WebGL program');
    this.disposal.trackProgram(prog);
    this.gl.attachShader(prog, vs);
    this.gl.attachShader(prog, fs);
    this.gl.linkProgram(prog);
    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(prog) ?? 'Shader link failure');
    }

    this.program = prog;
    this.aPositionLoc = this.gl.getAttribLocation(prog, 'aPosition');
    this.aNormalLoc = this.gl.getAttribLocation(prog, 'aNormal');
    this.uViewProjLoc = this.gl.getUniformLocation(prog, 'uViewProj');
    this.uPivotLoc = this.gl.getUniformLocation(prog, 'uPivot');
    this.uColorLoc = this.gl.getUniformLocation(prog, 'uColor');
    this.uShadedLoc = this.gl.getUniformLocation(prog, 'uShaded');
  }

  private getOrUploadMesh(mesh: CadExtrudedMesh3D): UploadedGpuMesh {
    const cached = this.gpuCache.get(mesh);
    if (cached) return cached;

    const gl = this.gl;
    const vbo = gl.createBuffer();
    const nbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !nbo || !ibo) {
      throw new Error('Failed to allocate GPU buffers');
    }
    this.disposal.trackBuffer(vbo);
    this.disposal.trackBuffer(nbo);
    this.disposal.trackBuffer(ibo);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const entry: UploadedGpuMesh = {
      vbo,
      nbo,
      ibo,
      indexCount: mesh.indices.length,
    };
    this.gpuCache.set(mesh, entry);
    return entry;
  }

  public renderScene(
    items: SceneRenderMeshItem[],
    camera: Camera3D,
    options: SceneRenderOptions = {},
  ): void {
    if (!this.program) return;
    const gl = this.gl;
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.059, 0.09, 0.165, 1.0); // #0f172a
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (items.length === 0) return;

    const { pivot, span } = computeScenePivotAndSpan(items);
    const activePivot = options.pivotCenter ?? pivot;
    const far = Math.max(50000, span * 20, camera.distance * 10);
    const viewProj = buildCameraMatrix4(camera, width, height, Math.max(1, span * 0.005), far);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProj);
    gl.uniform3f(this.uPivotLoc, activePivot.x, activePivot.y, activePivot.z);

    const viewMode = options.viewMode ?? 'shaded';
    const fallbackShaded = options.shadedColor ?? '#3b82f6';
    const fallbackWire = options.wireframeColor ?? '#38bdf8';

    // Subtle CAD floor reference grid under the model bounding box
    if (options.drawGroundGrid !== false) {
      let minZ = Infinity;
      for (const item of items) {
        if (item.mesh.bounds.minZ < minZ) minZ = item.mesh.bounds.minZ;
      }
      const gridZ = Number.isFinite(minZ) ? minZ : activePivot.z;
      const halfExtent = Math.max(span * 0.75, 200);
      const steps = 4;
      const stepSize = halfExtent / steps;
      const gridCoords: number[] = [];
      const gridNorms: number[] = [];
      for (let g = -steps; g <= steps; g++) {
        const offset = g * stepSize;
        gridCoords.push(
          activePivot.x - halfExtent, activePivot.y + offset, gridZ,
          activePivot.x + halfExtent, activePivot.y + offset, gridZ,
          activePivot.x + offset, activePivot.y - halfExtent, gridZ,
          activePivot.x + offset, activePivot.y + halfExtent, gridZ,
        );
        for (let k = 0; k < 4; k++) gridNorms.push(0, 0, 1);
      }

      if (!this.gridVbo) this.gridVbo = gl.createBuffer();
      if (!this.gridNbo) this.gridNbo = gl.createBuffer();
      if (this.gridVbo && this.gridNbo) {
        this.disposal.trackBuffer(this.gridVbo);
        this.disposal.trackBuffer(this.gridNbo);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridCoords), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aPositionLoc);
        gl.vertexAttribPointer(this.aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridNbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridNorms), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.aNormalLoc);
        gl.vertexAttribPointer(this.aNormalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.uniform4f(this.uColorLoc, 0.2, 0.26, 0.36, 1.0);
        gl.uniform1f(this.uShadedLoc, 0.0);
        gl.drawArrays(gl.LINES, 0, gridCoords.length / 3);
      }
    }

    const drawType =
      gl instanceof WebGL2RenderingContext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    if (viewMode === 'xray') {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }

    for (const item of items) {
      const gpu = this.getOrUploadMesh(item.mesh);

      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.vbo);
      gl.enableVertexAttribArray(this.aPositionLoc);
      gl.vertexAttribPointer(this.aPositionLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.nbo);
      gl.enableVertexAttribArray(this.aNormalLoc);
      gl.vertexAttribPointer(this.aNormalLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.ibo);

      const effColor = resolveItemEffectiveColor(
        item,
        viewMode === 'wireframe' ? fallbackWire : fallbackShaded,
      );
      const alpha = viewMode === 'xray' ? 0.35 : 1.0;
      const rgba = hexToRgba(effColor, alpha);
      gl.uniform4f(this.uColorLoc, rgba[0], rgba[1], rgba[2], rgba[3]);
      gl.uniform1f(this.uShadedLoc, viewMode === 'wireframe' ? 0.0 : 1.0);

      const mode = viewMode === 'wireframe' ? gl.LINES : gl.TRIANGLES;
      if (drawType === gl.UNSIGNED_INT) {
        gl.drawElements(mode, gpu.indexCount, gl.UNSIGNED_INT, 0);
      } else {
        // Safe fallback if WebGL1 lacks OES_element_index_uint
        const u16 = new Uint16Array(item.mesh.indices);
        const tmp = gl.createBuffer();
        if (tmp) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tmp);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, u16, gl.STREAM_DRAW);
          gl.drawElements(mode, u16.length, gl.UNSIGNED_SHORT, 0);
          gl.deleteBuffer(tmp);
        }
      }
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  public dispose(): void {
    this.gpuCache.clear();
    this.gridVbo = null;
    this.gridNbo = null;
    this.disposal.dispose();
  }
}
