import React from 'react';
import { Button } from '@/components/ui/Button';
import { PenTool, Image, Table, Save, Undo, Redo, ScanText } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterStore } from '@/core/writer/store';
import { useSessionStore } from '@/core/session/store';
import { bakeWriterElementsIntoPdf } from '@/core/writer/exporter';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useToastStore } from '@/core/toast/store';
import { error as logError } from '@/core/logger/service';

export const ToolbarWriter: React.FC = () => {
  const { activeTool, setActiveTool, undo, redo, undoStack, redoStack, elements } = useWriterStore();
  const { workingBytes, fileName, recordSaveExportAction } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);

  const handleBakeAndExport = async () => {
    if (!workingBytes || !fileName) return;

    try {
      const bakedBytes = await bakeWriterElementsIntoPdf(workingBytes, elements);
      const exportName = fileName.replace(/\.pdf$/i, '') + '-baked.pdf';
      await FileAdapter.savePdfBytes(bakedBytes, exportName, null);
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'success', `Exported baked ${exportName}`);
      addToast({ type: 'success', title: 'Exported Successfully', message: `Baked elements exported to ${exportName}` });
    } catch (err) {
      logError('writer', 'Failed to bake and export PDF', { error: String(err), fileName });
      recordSaveExportAction({ type: 'EXPORT_REVIEW_SNAPSHOT' }, 'failure', String(err));
      addToast({ type: 'error', title: 'Export Failed', message: 'Failed to export the document. Please try again.' });
    }
  };

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content="Undo">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={undoStack.length === 0}>
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Redo">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={redoStack.length === 0}>
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>

      <div style={{ width: 1, height: 20, background: 'var(--color-border-tertiary)', margin: '0 6px' }} />

      <Tooltip content="Writer Element">
        <Button variant={activeTool === 'place-text' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setActiveTool('place-text')}>
          <PenTool className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Place Image">
        <Button variant={activeTool === 'place-image' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setActiveTool('place-image')}>
          <Image className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Place Table">
        <Button variant={activeTool === 'place-table' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setActiveTool('place-table')}>
          <Table className="w-4 h-4" />
        </Button>
      </Tooltip>

      <div style={{ width: 1, height: 20, background: 'var(--color-border-tertiary)', margin: '0 6px' }} />

      <Tooltip content="OCR Region (Auto-text)">
        <Button variant={activeTool === 'ocr-region' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setActiveTool('ocr-region')}>
          <ScanText className="w-4 h-4" />
        </Button>
      </Tooltip>

      <div style={{ width: 1, height: 20, background: 'var(--color-border-tertiary)', margin: '0 6px' }} />

      <Tooltip content="Bake & Export">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBakeAndExport} disabled={!workingBytes || elements.length === 0}>
          <Save className="w-4 h-4" />
        </Button>
      </Tooltip>
    </div>
  );
};
