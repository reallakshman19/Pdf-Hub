import React from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { exportCurrentWriterProject } from '@/core/writer-v2/export/exportCurrentWriterProject';
import { importProjectIntoWriterStore } from '@/core/writer-v2/export/projectImportController';
import {
  downloadWriterBytes,
  safeDownloadBaseName,
} from '@/core/writer-v2/export/downloadWriterFile';
import { WriterKeyboardHandler } from './WriterKeyboardHandler';
import {
  Type, MessageSquareDot, Scan, FileDown, FolderArchive, FolderOpen,
} from 'lucide-react';

export const WriterV2ToolbarControls: React.FC = () => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);

  const workingBytes = useSessionStore((state) => state.workingBytes);
  const originalBytes = useSessionStore((state) => state.originalBytes);
  const fileName = useSessionStore((state) => state.fileName);
  const documentKey = useSessionStore((state) => state.documentKey);
  const openDocument = useSessionStore((state) => state.openDocument);
  const beginExportOperation = useSessionStore((state) => state.beginExportOperation);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const sourceBytes = workingBytes ?? originalBytes;
  const baseName = safeDownloadBaseName(fileName);

  const toggleTool = (tool: 'richTextBox' | 'textCallout') => {
    setActiveWriterTool(activeWriterTool === tool ? 'select' : tool);
  };

  const exportFlattenedPdf = async () => {
    if (!sourceBytes) {
      failSaveOperation('No PDF is open for flattened Writer V2 export.');
      return;
    }

    try {
      beginExportOperation('Exporting flattened Writer V2 PDF…');

      const bytes = await exportCurrentWriterPdf({
        pdfBytes: sourceBytes,
      });

      downloadWriterBytes(
        bytes,
        `${baseName}.writer-flattened.pdf`,
        'application/pdf',
      );

      completeSaveOperation('Flattened Writer V2 PDF exported.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const exportProjectZip = async () => {
    if (!sourceBytes) {
      failSaveOperation('No PDF is open for PDF Hub project export.');
      return;
    }

    try {
      beginExportOperation('Exporting editable PDF Hub project…');

      const bytes = await exportCurrentWriterProject({
        originalPdfBytes: sourceBytes,
        documentFingerprint: documentKey ?? undefined,
      });

      downloadWriterBytes(
        bytes,
        `${baseName}.pdfhub.zip`,
        'application/zip',
      );

      completeSaveOperation('Editable PDF Hub project exported.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const importProjectZip = async (file: File) => {
    try {
      beginExportOperation('Importing editable PDF Hub project…');

      const bytes = new Uint8Array(await file.arrayBuffer());
      const imported = await importProjectIntoWriterStore(bytes);
      const pdf = await PDFDocument.load(imported.originalPdfBytes);

      openDocument({
        documentKey: imported.documentFingerprint,
        fileName: file.name.replace(/\.pdfhub\.zip$/i, '.pdf'),
        bytes: imported.originalPdfBytes,
        pageCount: pdf.getPageCount(),
      });

      completeSaveOperation('Editable PDF Hub project imported.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      className="flex items-center gap-1"
      aria-label="Writer V2 toolbar controls"
      data-writer-v2-toolbar="true"
    >
      <WriterKeyboardHandler />
      <Tooltip content="Writer V2 Rich Text Box">
        <Button
          variant={activeWriterTool === 'richTextBox' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => toggleTool('richTextBox')}
          title="Text Box"
          aria-label="Text Box"
        >
          <span className="flex items-center gap-1">
            <Type className="w-3.5 h-3.5" />
            Text Box
          </span>
        </Button>
      </Tooltip>

      <Tooltip content="Writer V2 Text Callout">
        <Button
          variant={activeWriterTool === 'textCallout' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => toggleTool('textCallout')}
          title="Callout"
          aria-label="Callout"
        >
          <span className="flex items-center gap-1">
            <MessageSquareDot className="w-3.5 h-3.5" />
            Callout
          </span>
        </Button>
      </Tooltip>

      <Tooltip content="Select Box Copy: copy text, formatted text, tables, or image from a rectangle">
        <Button
          variant={activeWriterTool === 'selectBoxCopy' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            setActiveWriterTool(
              activeWriterTool === 'selectBoxCopy' ? 'select' : 'selectBoxCopy',
            );
          }}
          title="Copy Region"
          aria-label="Copy Region"
        >
          <span className="flex items-center gap-1">
            <Scan className="w-3.5 h-3.5" />
            Copy Region
          </span>
        </Button>
      </Tooltip>

      <Tooltip content="Export flattened Writer PDF">
        <Button
          variant="ghost"
          size="sm"
          onClick={exportFlattenedPdf}
          disabled={!sourceBytes}
          title="Flatten"
          aria-label="Flatten"
        >
          <span className="flex items-center gap-1">
            <FileDown className="w-3.5 h-3.5" />
            Flatten
          </span>
        </Button>
      </Tooltip>

      <Tooltip content="Export editable PDF Hub project">
        <Button
          variant="ghost"
          size="sm"
          onClick={exportProjectZip}
          disabled={!sourceBytes}
          title="Save Project"
          aria-label="Save Project"
        >
          <span className="flex items-center gap-1">
            <FolderArchive className="w-3.5 h-3.5" />
            Save Project
          </span>
        </Button>
      </Tooltip>

      <Tooltip content="Import editable PDF Hub project">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Open Project"
          aria-label="Open Project"
        >
          <span className="flex items-center gap-1">
            <FolderOpen className="w-3.5 h-3.5" />
            Open Project
          </span>
        </Button>
      </Tooltip>

      <input
        ref={fileInputRef}
        aria-label="Import PDF Hub project file"
        type="file"
        accept=".pdfhub.zip,.zip,application/zip"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (file) {
            void importProjectZip(file);
          }
        }}
      />
    </div>
  );
};
