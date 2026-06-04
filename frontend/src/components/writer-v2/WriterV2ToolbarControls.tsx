import React from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { exportCurrentWriterProject } from '@/core/writer-v2/export/exportCurrentWriterProject';
import { exportCurrentWriterRoundTripPdf } from '@/core/writer-v2/export/exportCurrentWriterRoundTripPdf';
import {
  importProjectIntoWriterStore,
  importRoundTripPdfIntoWriterStore,
} from '@/core/writer-v2/export/projectImportController';
import {
  downloadWriterBytes,
  safeDownloadBaseName,
} from '@/core/writer-v2/export/downloadWriterFile';
import { WriterKeyboardHandler } from './WriterKeyboardHandler';
import {
  Type, MessageSquareDot, Stamp, Tag, NotebookPen, Scan,
  FileDown, FileText, FolderArchive, FolderOpen,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ResponsiveBtnProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}

const ResponsiveBtn: React.FC<ResponsiveBtnProps> = ({
  icon: Icon,
  label,
  active,
  disabled,
  title,
  onClick,
}) => {
  const isMobile = useIsMobile();
  return (
    <Tooltip content={title}>
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size={isMobile ? 'icon' : 'sm'}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={label}
        className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : undefined}
      >
        {isMobile ? (
          <Icon className="w-[18px] h-[18px]" />
        ) : (
          <span className="flex items-center gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </span>
        )}
      </Button>
    </Tooltip>
  );
};

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

  const toggleTool = (tool: Exclude<typeof activeWriterTool, 'select' | 'selectBoxCopy'>) => {
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

  const exportEditablePdf = async () => {
    if (!sourceBytes) {
      failSaveOperation('No PDF is open for editable Writer PDF export.');
      return;
    }

    try {
      beginExportOperation('Exporting editable Writer PDF...');

      const bytes = await exportCurrentWriterRoundTripPdf({
        pdfBytes: sourceBytes,
        documentFingerprint: documentKey ?? undefined,
      });

      downloadWriterBytes(
        bytes,
        `${baseName}.editable.pdf`,
        'application/pdf',
      );

      completeSaveOperation('Editable Writer PDF exported.');
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

  const importProjectFile = async (file: File) => {
    try {
      beginExportOperation('Opening editable Writer project…');

      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf = /\.pdf$/i.test(file.name);

      // Editable round-trip PDF (Option C) carries the project as an attachment.
      const imported = isPdf
        ? await importRoundTripPdfIntoWriterStore(bytes)
        : await importProjectIntoWriterStore(bytes);

      if (!imported) {
        failSaveOperation(
          'This PDF has no editable Writer layer. Open it normally to view the flattened content.',
        );
        return;
      }

      const pdf = await PDFDocument.load(imported.originalPdfBytes);

      openDocument({
        documentKey: imported.documentFingerprint,
        fileName: file.name.replace(/\.pdfhub\.zip$/i, '.pdf'),
        bytes: imported.originalPdfBytes,
        pageCount: pdf.getPageCount(),
      });

      completeSaveOperation('Editable Writer project imported.');
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
      <ResponsiveBtn
        icon={Type}
        label="Text Box"
        active={activeWriterTool === 'richTextBox'}
        onClick={() => toggleTool('richTextBox')}
        title="Writer V2 Rich Text Box"
      />
      <ResponsiveBtn
        icon={MessageSquareDot}
        label="Callout"
        active={activeWriterTool === 'textCallout'}
        onClick={() => toggleTool('textCallout')}
        title="Writer V2 Text Callout"
      />
      <ResponsiveBtn
        icon={Stamp}
        label="Stamp"
        active={activeWriterTool === 'textStamp'}
        onClick={() => toggleTool('textStamp')}
        title="Text Stamp - borderless bold text (DRAFT, REVIEWED, etc.)"
      />
      <ResponsiveBtn
        icon={Tag}
        label="Review"
        active={activeWriterTool === 'reviewLabel'}
        onClick={() => toggleTool('reviewLabel')}
        title="Review Label - amber highlight annotation"
      />
      <ResponsiveBtn
        icon={NotebookPen}
        label="Note"
        active={activeWriterTool === 'richNote'}
        onClick={() => toggleTool('richNote')}
        title="Rich Note - yellow notepad-style sticky"
      />
      <ResponsiveBtn
        icon={Scan}
        label="Copy Region"
        active={activeWriterTool === 'selectBoxCopy'}
        onClick={() => setActiveWriterTool(activeWriterTool === 'selectBoxCopy' ? 'select' : 'selectBoxCopy')}
        title="Select Box Copy: copy text, formatted text, tables, or image from a rectangle"
      />
      <ResponsiveBtn
        icon={FileText}
        label="Editable PDF"
        disabled={!sourceBytes}
        onClick={exportEditablePdf}
        title="Save as editable .pdf - flattened for viewing, re-openable for editing in PDF Hub"
      />
      <ResponsiveBtn
        icon={FileDown}
        label="Flatten"
        disabled={!sourceBytes}
        onClick={exportFlattenedPdf}
        title="Export flattened Writer PDF (view-only, smaller)"
      />
      <ResponsiveBtn
        icon={FolderArchive}
        label="Save Project"
        disabled={!sourceBytes}
        onClick={exportProjectZip}
        title="Export editable PDF Hub project (.pdfhub.zip)"
      />
      <ResponsiveBtn
        icon={FolderOpen}
        label="Open Project"
        onClick={() => fileInputRef.current?.click()}
        title="Open an editable .pdf or .pdfhub.zip project"
      />

      <input
        ref={fileInputRef}
        aria-label="Import editable Writer project or PDF"
        type="file"
        accept=".pdf,application/pdf,.pdfhub.zip,.zip,application/zip"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (file) {
            void importProjectFile(file);
          }
        }}
      />
    </div>
  );
};
