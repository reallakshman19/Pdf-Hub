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
  Table as TableIcon, Image as ImageIcon, ListChecks,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { createImageBoxElement } from '@/core/writer-v2/writerElementFactory';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { WriterExportPreflightDialog } from './WriterExportPreflightDialog';
import {
  runCurrentWriterExportPreflight,
  type WriterExportPreflightResult,
} from '@/core/writer-v2/export/writerExportPreflight';
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
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingPreflight, setPendingPreflight] = React.useState<{
    label: string;
    result: WriterExportPreflightResult;
    action: () => Promise<void>;
  } | null>(null);

  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);
  const addWriterAssets = useWriterV2Store((state) => state.addWriterAssets);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const elements = useWriterV2Store((state) => state.elements);

  const workingBytes = useSessionStore((state) => state.workingBytes);
  const originalBytes = useSessionStore((state) => state.originalBytes);
  const fileName = useSessionStore((state) => state.fileName);
  const documentKey = useSessionStore((state) => state.documentKey);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);
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

  const importImageAsWriterObject = async (file: File) => {
    if (!sourceBytes) {
      failSaveOperation('Open a PDF before inserting an image.');
      return;
    }

    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      failSaveOperation('Only PNG, JPG, and WEBP images are supported.');
      return;
    }

    try {
      beginExportOperation('Importing image as Writer object...');

      const originalDataUrl = await readFileAsDataUrl(file);
      const dataUrl = file.type.toLowerCase() === 'image/webp'
        ? await renderImageDataUrlToPng(originalDataUrl)
        : originalDataUrl;
      const mimeType = file.type.toLowerCase() === 'image/webp'
        ? 'image/png'
        : file.type;
      const imageSize = await measureImageDataUrl(dataUrl);
      const pdf = await PDFDocument.load(sourceBytes);
      const pageIndex = Math.max(0, Math.min(currentPage - 1, pdf.getPageCount() - 1));
      const page = pdf.getPage(pageIndex);
      const pageSize = page.getSize();

      const maxWidth = Math.min(280, pageSize.width * 0.5);
      const maxHeight = Math.min(180, pageSize.height * 0.35);
      const scale = Math.min(
        maxWidth / Math.max(1, imageSize.width),
        maxHeight / Math.max(1, imageSize.height),
        1,
      );

      const width = Math.max(40, imageSize.width * scale);
      const height = Math.max(40, imageSize.height * scale);
      const documentFingerprint = documentKey ?? fileName ?? 'writer-v2-unsaved-document';
      const assetId = createWriterAssetId();
      const now = new Date().toISOString();
      const asset: WriterAssetRecordV2 = {
        id: assetId,
        documentFingerprint,
        kind: 'image',
        mimeType,
        dataUrl,
        width: imageSize.width,
        height: imageSize.height,
        createdAt: now,
        updatedAt: now,
      };

      const maxZIndex = elements.reduce(
        (max, element) => Math.max(max, element.style.zIndex),
        0,
      );

      const element = createImageBoxElement({
        documentFingerprint,
        pageIndex,
        imageAssetId: assetId,
        rect: {
          x: pageSize.width / 2 - width / 2,
          y: pageSize.height / 2 - height / 2,
          width,
          height,
        },
        text: file.name,
        zIndex: maxZIndex + 1,
      });

      addWriterAssets([asset]);
      dispatchWriterCommand({
        type: 'ADD_WRITER_ELEMENT',
        element,
      });

      completeSaveOperation('Image inserted as editable Writer object.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    } finally {
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
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
        icon={TableIcon}
        label="Table"
        active={activeWriterTool === 'tableBox'}
        onClick={() => toggleTool('tableBox')}
        title="Insert Writer table object"
      />
      <ResponsiveBtn
        icon={ImageIcon}
        label="Image"
        disabled={!sourceBytes}
        onClick={() => imageInputRef.current?.click()}
        title="Insert image as Writer object"
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

      <input
        ref={imageInputRef}
        aria-label="Import image as Writer object"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (file) {
            void importImageAsWriterObject(file);
          }
        }}
      />

      {pendingPreflight ? (
        <WriterExportPreflightDialog
          result={pendingPreflight.result}
          exportLabel={pendingPreflight.label}
          onCancel={() => setPendingPreflight(null)}
          onContinue={() => {
            const action = pendingPreflight.action;
            setPendingPreflight(null);
            void action();
          }}
        />
      ) : null}
    </div>
  );
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Image import did not produce a data URL.'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function measureImageDataUrl(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      });
    };

    image.onerror = () => reject(new Error('Failed to measure imported image.'));
    image.src = dataUrl;
  });
}

async function renderImageDataUrlToPng(dataUrl: string): Promise<string> {
  const imageSize = await measureImageDataUrl(dataUrl);
  const image = await loadImageDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available for WEBP image conversion.');
  }

  context.drawImage(image, 0, 0, imageSize.width, imageSize.height);
  return canvas.toDataURL('image/png');
}

function loadImageDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load imported image.'));
    image.src = dataUrl;
  });
}

function createWriterAssetId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `writer-asset-${globalThis.crypto.randomUUID()}`;
  }

  return `writer-asset-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
