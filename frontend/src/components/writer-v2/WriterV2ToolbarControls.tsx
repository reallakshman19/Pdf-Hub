import React from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { exportCurrentWriterProject } from '@/core/writer-v2/export/exportCurrentWriterProject';
import { exportCurrentWriterRoundTripPdf } from '@/core/writer-v2/export/exportCurrentWriterRoundTripPdf';
import { exportCurrentWriterDocx } from '@/core/writer-v2/export/exportCurrentWriterDocx';
import { DOCX_MIME } from '@/core/writer-v2/export/docx';
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
  ListChecks,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { WriterExportPreflightDialog } from './WriterExportPreflightDialog';
import { WriterTablePropertiesDock } from './WriterTablePropertiesDock';

import {
  runWriterRichToolbarAction,
  type WriterRichToolbarActionId,
} from '@/core/writer-v2/writerRichToolbarActions';
import {
  runCurrentWriterExportPreflight,
  type WriterExportPreflightResult,
} from '@/core/writer-v2/export/writerExportPreflight';
import { fixRichContentClipIssues } from '@/core/writer-v2/export/writerPreflightFixes';
import { autosaveCurrentWriterDraft } from '@/core/writer-v2/persistence/writerAutosave';
import {
  downloadCurrentWriterCommentSummary,
  type WriterCommentSummaryFormat,
} from '@/core/writer-v2/export/writerCommentSummary';

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
  const [pendingPreflight, setPendingPreflight] = React.useState<{
    label: string;
    result: WriterExportPreflightResult;
    action: () => Promise<void>;
  } | null>(null);

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

  const exportDocx = async () => {
    if (!sourceBytes) {
      failSaveOperation('No PDF is open for Writer DOCX export.');
      return;
    }

    if (!documentKey) {
      failSaveOperation('No document key is available for Writer DOCX export.');
      return;
    }

    try {
      beginExportOperation('Exporting Writer V2 DOCX...');

      await autosaveCurrentWriterDraft(undefined, { force: true });

      const result = await exportCurrentWriterDocx({
        documentFingerprint: documentKey,
        title: `${baseName} Writer V2`,
      });

      if (result.fatal) {
        const firstError = result.diagnostics.find(
          (diagnostic) => diagnostic.level === 'error',
        );

        failSaveOperation(
          firstError?.message ?? 'Writer DOCX export failed.',
        );
        return;
      }

      downloadWriterBytes(
        result.bytes,
        `${baseName}.writer.docx`,
        DOCX_MIME,
      );

      const warningCount = result.diagnostics.filter(
        (diagnostic) => diagnostic.level === 'warning',
      ).length;

      completeSaveOperation(
        warningCount > 0
          ? `Writer DOCX exported with ${warningCount} warning(s).`
          : 'Writer DOCX exported.',
      );
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
      await autosaveCurrentWriterDraft(undefined, { force: true });

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



  const runRichToolbarAction = async (
    actionId: WriterRichToolbarActionId,
    label: string,
  ) => {
    try {
      beginExportOperation(`${label}...`);
      const result = await runWriterRichToolbarAction(actionId);

      if (result.changed) {
        completeSaveOperation(result.message);
      } else {
        failSaveOperation(result.message);
      }
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };


  const runWithWriterPreflight = async (
    label: string,
    action: () => Promise<void>,
  ) => {
    const result = await runCurrentWriterExportPreflight();

    if (result.hasErrors || result.hasWarnings) {
      setPendingPreflight({
        label,
        result,
        action,
      });
      return;
    }

    await action();
  };

  const fixPendingRichContentClipping = async () => {
    if (!pendingPreflight) return;

    try {
      beginExportOperation('Fitting clipped Writer rich boxes...');

      const fix = await fixRichContentClipIssues(pendingPreflight.result);
      const refreshed = await runCurrentWriterExportPreflight();

      setPendingPreflight({
        ...pendingPreflight,
        result: refreshed,
      });

      if (fix.changed) {
        completeSaveOperation(fix.message);
      } else {
        failSaveOperation(fix.message);
      }
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  const exportCommentSummary = (format: WriterCommentSummaryFormat) => {
    const result = downloadCurrentWriterCommentSummary(format);

    if (result.changed) {
      completeSaveOperation(result.message);
    } else {
      failSaveOperation(result.message);
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
        label="Writer Box"
        disabled={!sourceBytes}
        onClick={() => {
          void runRichToolbarAction('mainRichBox', 'Opening Writer rich box');
        }}
        title="Create or open the main Writer rich authoring box"
      />
      <ResponsiveBtn
        icon={MessageSquareDot}
        label="Callout"
        disabled={!sourceBytes}
        onClick={() => {
          void runRichToolbarAction('calloutSnippet', 'Inserting Writer callout');
        }}
        title="Insert a callout snippet inside the active Writer rich box"
      />
      <ResponsiveBtn
        icon={Stamp}
        label="Stamp"
        disabled={!sourceBytes}
        onClick={() => {
          void runRichToolbarAction('stampSnippet', 'Inserting Writer stamp');
        }}
        title="Insert a stamp snippet inside the active Writer rich box"
      />
      <ResponsiveBtn
        icon={Tag}
        label="Review"
        disabled={!sourceBytes}
        onClick={() => {
          void runRichToolbarAction('reviewSnippet', 'Inserting Writer review');
        }}
        title="Insert a review snippet inside the active Writer rich box"
      />
      <ResponsiveBtn
        icon={NotebookPen}
        label="Note"
        disabled={!sourceBytes}
        onClick={() => {
          void runRichToolbarAction('noteSnippet', 'Inserting Writer note');
        }}
        title="Insert a note snippet inside the active Writer rich box"
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
        onClick={() => {
          void runWithWriterPreflight('Editable PDF', exportEditablePdf);
        }}
        title="Save as editable .pdf - flattened for viewing, re-openable for editing in PDF Hub"
      />
      <ResponsiveBtn
        icon={FileText}
        label="DOCX"
        disabled={!sourceBytes}
        onClick={() => {
          void runWithWriterPreflight('Writer DOCX', exportDocx);
        }}
        title="Export Writer V2 authored layer as Word DOCX"
      />
      <ResponsiveBtn
        icon={FileDown}
        label="Flatten"
        disabled={!sourceBytes}
        onClick={() => {
          void runWithWriterPreflight('Flattened PDF', exportFlattenedPdf);
        }}
        title="Export flattened Writer PDF (view-only, smaller)"
      />
      <ResponsiveBtn
        icon={ListChecks}
        label="Comments CSV"
        onClick={() => exportCommentSummary('csv')}
        title="Export Writer comments/review objects as CSV"
      />
      <ResponsiveBtn
        icon={ListChecks}
        label="Comments MD"
        onClick={() => exportCommentSummary('markdown')}
        title="Export Writer comments/review objects as Markdown"
      />
      <ResponsiveBtn
        icon={ListChecks}
        label="Comments JSON"
        onClick={() => exportCommentSummary('json')}
        title="Export Writer comments/review objects as JSON"
      />
      <ResponsiveBtn
        icon={FolderArchive}
        label="Save Project"
        disabled={!sourceBytes}
        onClick={() => {
          void runWithWriterPreflight('PDF Hub Project ZIP', exportProjectZip);
        }}
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



      {pendingPreflight ? (
        <WriterExportPreflightDialog
          result={pendingPreflight.result}
          exportLabel={pendingPreflight.label}
          onCancel={() => setPendingPreflight(null)}
          onFixRichContentClipping={fixPendingRichContentClipping}
          onContinue={() => {
            const action = pendingPreflight.action;
            setPendingPreflight(null);
            void action();
          }}
        />
      ) : null}
      <WriterTablePropertiesDock />
    </div>
  );
};


