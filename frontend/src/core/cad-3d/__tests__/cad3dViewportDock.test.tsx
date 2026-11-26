import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebGlDisposalManager } from '../webglDisposal';
import { useCadModelingStore } from '../../cad-modeling/store';
import { Cad3DViewportDock } from '@/components/cad/Cad3DViewportDock';
import type { CadClosedLoop } from '../../cad-geometry/types';

describe('CAD 3D Viewport Dock & WebGL VRAM Disposal - Mini-Phase P.3', () => {
  beforeEach(() => {
    useCadModelingStore.getState().reset();
  });

  describe('FALSIFY-VPT-01: WebGL Active VRAM Disposal', () => {
    it('tracks GPU assets and explicitly releases all buffers, shaders, programs, and triggers context loss', () => {
      const deleteBufferMock = vi.fn();
      const deleteShaderMock = vi.fn();
      const deleteProgramMock = vi.fn();
      const deleteTextureMock = vi.fn();
      const loseContextMock = vi.fn();

      const mockGl = {
        deleteBuffer: deleteBufferMock,
        deleteShader: deleteShaderMock,
        deleteProgram: deleteProgramMock,
        deleteTexture: deleteTextureMock,
        getExtension: (name: string) => {
          if (name === 'WEBGL_lose_context') {
            return { loseContext: loseContextMock };
          }
          return null;
        },
      } as unknown as WebGLRenderingContext;

      const manager = new WebGlDisposalManager(mockGl);

      // Track dummy WebGL objects
      const buf1 = {} as WebGLBuffer;
      const buf2 = {} as WebGLBuffer;
      const shader = {} as WebGLShader;
      const prog = {} as WebGLProgram;
      const tex = {} as WebGLTexture;

      manager.trackBuffer(buf1);
      manager.trackBuffer(buf2);
      manager.trackShader(shader);
      manager.trackProgram(prog);
      manager.trackTexture(tex);

      expect(manager.getResourceCounts()).toEqual({
        buffers: 2,
        shaders: 1,
        programs: 1,
        textures: 1,
      });

      // Trigger full disposal
      manager.dispose();

      expect(deleteBufferMock).toHaveBeenCalledTimes(2);
      expect(deleteShaderMock).toHaveBeenCalledTimes(1);
      expect(deleteProgramMock).toHaveBeenCalledTimes(1);
      expect(deleteTextureMock).toHaveBeenCalledTimes(1);
      expect(loseContextMock).toHaveBeenCalledTimes(1);

      expect(manager.getResourceCounts()).toEqual({
        buffers: 0,
        shaders: 0,
        programs: 0,
        textures: 0,
      });
    });
  });

  describe('FALSIFY-VPT-02 & FALSIFY-VPT-04: Dock Visibility & View Mode Switching', () => {
    it('renders 3D dock when open, switches view modes, and displays mesh telemetry', () => {
      const sampleLoop: CadClosedLoop = {
        id: 'loop_alpha',
        vertices: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
          { x: 0, y: 50 },
        ],
        area: 2500,
        perimeter: 200,
        centroid: { x: 25, y: 25 },
        isClockwise: false,
        bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
        edgeIds: ['e1', 'e2', 'e3', 'e4'],
      };

      const store = useCadModelingStore.getState();
      store.setHarvestedLoops([sampleLoop]);
      store.set3DDockOpen(true);

      render(<Cad3DViewportDock />);

      expect(screen.getByTestId('cad-3d-viewport-dock')).toBeDefined();
      expect(screen.getByTestId('dock-loop-select')).toBeDefined();
      expect(screen.getByTestId('dock-footer-telemetry')).toBeDefined();

      // View mode toggling
      const wireframeBtn = screen.getByTestId('dock-mode-wireframe');
      fireEvent.click(wireframeBtn);
      expect(useCadModelingStore.getState().dock3d.viewMode).toBe('wireframe');

      const xrayBtn = screen.getByTestId('dock-mode-xray');
      fireEvent.click(xrayBtn);
      expect(useCadModelingStore.getState().dock3d.viewMode).toBe('xray');

      const shadedBtn = screen.getByTestId('dock-mode-shaded');
      fireEvent.click(shadedBtn);
      expect(useCadModelingStore.getState().dock3d.viewMode).toBe('shaded');
    });

    it('renders empty state when no closed loops are present in store', () => {
      useCadModelingStore.getState().set3DDockOpen(true);

      render(<Cad3DViewportDock />);
      expect(screen.getByTestId('dock-empty-state')).toBeDefined();
      expect(screen.getByText('Select or harvest a 2D closed loop to extrude in 3D.')).toBeDefined();
    });
  });

  describe('FALSIFY-VPT-03: Interactive Orbit & Pan Camera Controls', () => {
    it('handles mouse drag for camera orbit and wheel for zoom', () => {
      const sampleLoop: CadClosedLoop = {
        id: 'loop_1',
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
        ],
        area: 200,
        perimeter: 60,
        centroid: { x: 10, y: 10 },
        isClockwise: false,
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        edgeIds: ['e1'],
      };

      useCadModelingStore.getState().setHarvestedLoops([sampleLoop]);
      useCadModelingStore.getState().set3DDockOpen(true);

      render(<Cad3DViewportDock />);

      const canvas = screen.getByTestId('dock-3d-canvas');

      // Mouse drag to orbit
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 120 });
      fireEvent.mouseUp(canvas);

      // Mouse wheel to zoom
      fireEvent.wheel(canvas, { deltaY: -100 });

      // Reset camera
      const resetBtn = screen.getByTestId('dock-btn-reset-camera');
      fireEvent.click(resetBtn);

      // Close button
      const closeBtn = screen.getByTestId('dock-btn-close');
      fireEvent.click(closeBtn);
      expect(useCadModelingStore.getState().dock3d.isOpen).toBe(false);
    });
  });

  describe('FALSIFY-VPT-05: Automatic GPU Resource Release on Unmount', () => {
    it('disposes WebGlDisposalManager when component unmounts', () => {
      const disposeSpy = vi.spyOn(WebGlDisposalManager.prototype, 'dispose');

      useCadModelingStore.getState().set3DDockOpen(true);
      const { unmount } = render(<Cad3DViewportDock />);

      unmount();

      expect(disposeSpy).toHaveBeenCalled();
      disposeSpy.mockRestore();
    });
  });
});
