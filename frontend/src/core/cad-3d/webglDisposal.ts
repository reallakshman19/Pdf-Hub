export interface TrackedWebGlResources {
  buffers: Set<WebGLBuffer>;
  shaders: Set<WebGLShader>;
  programs: Set<WebGLProgram>;
  textures: Set<WebGLTexture>;
}

/**
 * Manages tracking and active cleanup of WebGL GPU resources (buffers, shaders, programs, textures)
 * and triggers loseContext() to immediately free VRAM when closing 3D docks on large PDFs.
 */
export class WebGlDisposalManager {
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private readonly resources: TrackedWebGlResources = {
    buffers: new Set(),
    shaders: new Set(),
    programs: new Set(),
    textures: new Set(),
  };

  constructor(gl?: WebGLRenderingContext | WebGL2RenderingContext | null) {
    if (gl) this.bindContext(gl);
  }

  public bindContext(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.gl = gl;
  }

  public trackBuffer(buf: WebGLBuffer): WebGLBuffer {
    this.resources.buffers.add(buf);
    return buf;
  }

  public trackShader(shader: WebGLShader): WebGLShader {
    this.resources.shaders.add(shader);
    return shader;
  }

  public trackProgram(prog: WebGLProgram): WebGLProgram {
    this.resources.programs.add(prog);
    return prog;
  }

  public trackTexture(tex: WebGLTexture): WebGLTexture {
    this.resources.textures.add(tex);
    return tex;
  }

  public getResourceCounts(): {
    buffers: number;
    shaders: number;
    programs: number;
    textures: number;
  } {
    return {
      buffers: this.resources.buffers.size,
      shaders: this.resources.shaders.size,
      programs: this.resources.programs.size,
      textures: this.resources.textures.size,
    };
  }

  /**
   * Aggressively deletes all tracked GPU assets and loses the WebGL context.
   */
  public dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    // 1. Delete all buffers
    for (const buf of this.resources.buffers) {
      try {
        gl.deleteBuffer(buf);
      } catch {
        // Safe disposal
      }
    }
    this.resources.buffers.clear();

    // 2. Delete all textures
    for (const tex of this.resources.textures) {
      try {
        gl.deleteTexture(tex);
      } catch {
        // Safe disposal
      }
    }
    this.resources.textures.clear();

    // 3. Delete all programs
    for (const prog of this.resources.programs) {
      try {
        gl.deleteProgram(prog);
      } catch {
        // Safe disposal
      }
    }
    this.resources.programs.clear();

    // 4. Delete all shaders
    for (const shader of this.resources.shaders) {
      try {
        gl.deleteShader(shader);
      } catch {
        // Safe disposal
      }
    }
    this.resources.shaders.clear();

    // 5. Force GPU context loss if WEBGL_lose_context is available
    try {
      const loseContextExt = gl.getExtension('WEBGL_lose_context');
      if (loseContextExt) {
        loseContextExt.loseContext();
      }
    } catch {
      // Ignore if unsupported
    }

    this.gl = null;
  }
}
