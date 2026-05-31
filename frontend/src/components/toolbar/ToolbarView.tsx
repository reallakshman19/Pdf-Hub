import React from 'react';
import { ZoomIn, ZoomOut, Expand, Maximize, MousePointer2, Hand } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';

export const ToolbarView: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore();
  const { viewState, pageCount, setZoom, setFitMode, setViewMode, setPage } = useSessionStore();

  const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];

  const handleZoomOut = () => {
    const nextZoom = zoomSteps.slice().reverse().find((step) => step < viewState.zoom) || 25;
    setZoom(nextZoom);
  };

  const handleZoomIn = () => {
    const nextZoom = zoomSteps.find((step) => step > viewState.zoom) || 400;
    setZoom(nextZoom);
  };

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content="Select Text">
        <Button
          variant={activeTool === 'select' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setActiveTool('select')}
        >
          <MousePointer2 className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Hand Tool">
        <Button
          variant={activeTool === 'hand' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8 mr-4"
          onClick={() => setActiveTool('hand')}
        >
          <Hand className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Zoom Out">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut} disabled={viewState.zoom <= 25}>
          <ZoomOut className="w-4 h-4" />
        </Button>
      </Tooltip>

      <div className="w-16 text-center text-xs font-medium">{viewState.zoom}%</div>

      <Tooltip content="Zoom In">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn} disabled={viewState.zoom >= 400}>
          <ZoomIn className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Fit Width">
        <Button
          variant={viewState.fitMode === 'width' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8 ml-2"
          onClick={() => setFitMode('width')}
        >
          <Expand className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Fit Page">
        <Button
          variant={viewState.fitMode === 'page' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setFitMode('page')}
        >
          <Maximize className="w-4 h-4" />
        </Button>
      </Tooltip>

      <div className="ml-3 flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
        <Button
          variant={viewState.viewMode === 'continuous' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('continuous')}
        >
          Cont
        </Button>
        <Button
          variant={viewState.viewMode === 'single' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('single')}
        >
          Single
        </Button>
        <Button
          variant={viewState.viewMode === 'two-page' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('two-page')}
        >
          2-Up
        </Button>
      </div>

      <div className="ml-3 flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
        <span className="text-xs text-slate-500">Page</span>
        <input
          type="number"
          min={1}
          max={Math.max(1, pageCount)}
          value={viewState.currentPage}
          onChange={(event) => setPage(Number(event.target.value))}
          className="w-16 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
        />
        <span className="text-xs text-slate-500">/ {pageCount || '-'}</span>
      </div>
    </div>
  );
};
