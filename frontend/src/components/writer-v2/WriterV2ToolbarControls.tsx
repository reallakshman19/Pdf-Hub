import React from 'react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store, type WriterV2Tool } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { createOcrProjectPayloadFromStore, hydrateOcrStoreFromProjectPayload } from '@/core/ocr/ocrHydrationBridge';
import { buildPageGraphFromPdfBytes } from '@/core/pages/pageGraphAdmission';
import { useEditorStore } from '@/core/editor/store';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { exportCurrentWriterProject } from '@/core/writer-v2/export/exportCurrentWriterProject';
import { exportCurrentWriterRoundTripPdf } from '@/core/writer-v2/export/exportCurrentWriterRoundTripPdf';
import { exportCurrentWriterDocx } from '@/core/writer-v2/export/exportCurrentWriterDocx';
import { exportLiveBlankWriterDocx } from '@/core/writer-v2/export/exportLiveBlankWriterDocx';
import { DOCX_MIME } from '@/core/writer-v2/export/docx';
import {
  commitStagedWriterProjectImport,
  importRoundTripPdfIntoWriterStore,
  revokeStagedWriterProjectImport,
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
  type StagedWriterProjectImport,
} from '@/core/writer-v2/export/projectImportController';
import {
  downloadWriterBytes,
  safeDownloadBaseName,
} from '@/core/writer-v2/export/downloadWriterFile';
import { WriterKeyboardHandler } from './WriterKeyboardHandler';
import {
  Type, MessageSquareDot, Stamp, Tag, NotebookPen, Scan,
  FileDown, FileText, FolderArchive, FolderOpen,
  ListChecks, Table as TableIcon, MoreHorizontal, SlidersHorizontal,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { WriterExportPreflightDialog } from './WriterExportPreflightDialog';
import { WriterTablePropertiesDock } from './WriterTablePropertiesDock';
import { BlankDocumentCreateDialog } from './BlankDocumentCreateDialog';
import { WriterBlankImageInsertButton } from './WriterBlankImageInsertButton';
import { WriterSelectionQuickActions } from './WriterSelectionQuickActions';

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
  const mountedRef = React.useRef(true);
  const standaloneImportRef = React.useRef<{
    generation: number;
    controller: AbortController;
    staged: StagedWriterProjectImport | null;
  } | null>(null);
  const standaloneImportGenerationRef = React.useRef(0);
  const [blankDialogOpen, setBlankDialogOpen] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [pendingPreflight, setPendingPreflight] = React.useState<{
    label: string;
    result: WriterExportPreflightResult;
    action: () => Promise<void>;
  } | null>(null);

  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);
  const createBlankWriterDocument = useWriterV2Store((state) => state.createBlankWriterDocument);
  const documentMeta = useWriterV2Store((state) => state.documentMeta);
  const toolsHubOpen = useWriterV2Store((state) => state.toolsHubOpen);
  const toggleToolsHub = useWriterV2Store((state) => state.toggleToolsHub);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);

  const workingBytes = useSessionStore((state) => state.workingBytes);
  const originalBytes = useSessionStore((state) => state.originalBytes);
  const fileName = useSessionStore((state) => state.fileName);
  const documentKey = useSessionStore((state) => state.documentKey);
  const openDocument = useSessionStore((state) => state.openDocument);
  const clearDocument = useSessionStore((state) => state.clearDocument);
  const beginExportOperation = useSessionStore((state) => state.beginExportOperation);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const sourceBytes = workingBytes ?? originalBytes;
  const isBlankDocument = documentMeta?.mode === 'blankDocument';
  const hasWriterSurface = Boolean(sourceBytes) || isBlankDocument;
  const baseName = safeDownloadBaseName(fileName ?? documentMeta?.title);

  const activateBlankPlacementTool = (tool: WriterV2Tool) => {
    setActiveMode('write');
    setActiveWriterTool(tool);
  };

  const runWriterActionOrPlace = (
    tool: WriterV2Tool,
    actionId: WriterRichToolbarActionId,
    label: string,
  ) => {
    if (isBlankDocument) {
      activateBlankPlacementTool(tool);
      return;
    }

    void runRichToolbarAction(actionId, label);
  };

  const createBlankDocument = (input: Parameters<typeof createBlankWriterDocument>[0]) => {
    const meta = createBlankWriterDocument(input);
    clearDocument();
    setActiveMode('write');
    setBlankDialogOpen(false);
    completeSaveOperation(`Blank Writer document created: ${meta.title ?? 'Untitled document'}.`);
  };

  const exportFlattenedPdf = async () => {
    if (!sourceBytes && !isBlankDocument) {
      failSaveOperation('No PDF or blank Writer document is open for Writer PDF export.');
      return;
    }

    try {
      beginExportOperation('Exporting Writer PDF…');

      const bytes = await exportCurrentWriterPdf({
        pdfBytes: sourceBytes,
      });

      downloadWriterBytes(
        bytes,
        `${baseName}.writer-flattened.pdf`,
        'application/pdf',
      );

      completeSaveOperation('Writer PDF exported.');
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
    const documentFingerprint = documentKey ?? documentMeta?.documentFingerprint;

    if (!documentFingerprint) {
      failSaveOperation('No document key is available for Writer DOCX export.');
      return;
    }

    try {
      beginExportOperation('Exporting Writer V2 DOCX...');

      const result = isBlankDocument
        ? await exportLiveBlankWriterDocx({
            title: `${baseName} Writer V2`,
          })
        : await exportPdfBackedDocx(documentFingerprint, `${baseName} Writer V2`);

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

  const exportPdfBackedDocx = async (documentFingerprint: string, title: string) => {
    await autosaveCurrentWriterDraft(undefined, { force: true });

    return await exportCurrentWriterDocx({
      documentFingerprint,
      title,
    });
  };

  const exportProjectZip = async () => {
    if (!hasWriterSurface) {
      failSaveOperation('No PDF or blank Writer document is open for project export.');
      return;
    }

    try {
      beginExportOperation('Exporting editable PDF Hub project…');
      await autosaveCurrentWriterDraft(undefined, { force: true });

      const fingerprint = documentKey ?? documentMeta?.documentFingerprint;
      const ocrStore = useOcrStore.getState();
      const hasOcrData = Boolean(
        ocrStore.result || ocrStore.corrections.length || ocrStore.regions.length,
      );
      if (hasOcrData && ocrStore.documentFingerprint !== fingerprint) {
        throw new Error('OCR state belongs to another document; project export was not completed.');
      }
      const ocrProject = hasOcrData && fingerprint
        ? createOcrProjectPayloadFromStore({ documentFingerprint: fingerprint, store: ocrStore })
        : null;

      const bytes = await exportCurrentWriterProject({
        originalPdfBytes: sourceBytes,
        documentFingerprint: fingerprint ?? documentKey ?? documentMeta?.documentFingerprint,
        ocrProject,
        // The project-ZIP worker path is not yet certified in static browser
        // builds. Use the deterministic main-thread exporter for editable
        // recovery until worker correctness and timeout fallback are proven.
        useWorker: false,
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

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = standaloneImportRef.current;
      active?.controller.abort('Writer toolbar unmounted.');
      if (active?.staged) revokeStagedWriterProjectImport(active.staged);
      standaloneImportRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!moreMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [moreMenuOpen]);

  const importProjectFile = async (file: File) => {
    beginExportOperation('Opening editable Writer project…');
    const isPdf = /\.pdf$/i.test(file.name);

    if (isPdf) {
      try {
        // Editable round-trip PDF (Option C) remains a separate compatibility path.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const imported = await importRoundTripPdfIntoWriterStore(bytes);
        if (!imported) {
          failSaveOperation(
            'This PDF has no editable Writer layer. Open it normally to view the flattened content.',
          );
          return;
        }
        const pageGraph = await buildPageGraphFromPdfBytes(
          imported.originalPdfBytes,
          imported.documentFingerprint,
        );
        openDocument({
          documentKey: imported.documentFingerprint,
          fileName: file.name,
          bytes: imported.originalPdfBytes,
          pageCount: pageGraph.pages.length,
          pageGraph,
        });
        completeSaveOperation('Editable Writer project imported.');
      } catch (error) {
        failSaveOperation(error instanceof Error ? error.message : String(error));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    const previous = standaloneImportRef.current;
    previous?.controller.abort('Superseded by a newer standalone Writer project import.');
    if (previous?.staged) revokeStagedWriterProjectImport(previous.staged);

    const generation = standaloneImportGenerationRef.current + 1;
    standaloneImportGenerationRef.current = generation;
    const controller = new AbortController();
    standaloneImportRef.current = { generation, controller, staged: null };

    const operation: StandaloneWriterProjectOperation = {
      operationId: `writer-project-${generation}`,
      generation,
      signal: controller.signal,
      isMounted: () => mountedRef.current,
      isCurrent: () =>
        mountedRef.current &&
        standaloneImportRef.current?.generation === generation &&
        !controller.signal.aborted,
    };

    try {
      const staged = await stageStandaloneWriterProject(file, operation);
      if (!operation.isCurrent()) {
        revokeStagedWriterProjectImport(staged);
        return;
      }
      if (standaloneImportRef.current?.generation === generation) {
        standaloneImportRef.current.staged = staged;
      }
      const imported = await commitStagedWriterProjectImport(staged, operation, {
        prepareOcrRestore: (payload, documentFingerprint) => {
          const previousOcrState = useOcrStore.getState();
          return {
            apply: () => {
              const result = hydrateOcrStoreFromProjectPayload({
                payload,
                expectedDocumentFingerprint: documentFingerprint,
              });
              if (!result.restored) {
                throw new Error('Writer project OCR payload could not be restored.');
              }
            },
            rollback: () => useOcrStore.setState(previousOcrState, true),
          };
        },
      });
      if (!operation.isCurrent()) return;
      completeSaveOperation(
        imported.documentMeta?.mode === 'blankDocument'
          ? 'Blank Writer project imported.'
          : 'Editable Writer project imported.',
      );
    } catch (error) {
      if (operation.isCurrent()) {
        failSaveOperation(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (standaloneImportRef.current?.generation === generation) {
        standaloneImportRef.current = null;
      }
      controller.abort('Standalone Writer project import completed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        icon={FileText}
        label="Blank Doc"
        active={isBlankDocument}
        onClick={() => setBlankDialogOpen(true)}
        title="Create a blank Writer document without a PDF background"
      />
      <ResponsiveBtn
        icon={Type}
        label="Writer Box"
        disabled={!hasWriterSurface}
        active={isBlankDocument && activeWriterTool === 'richTextBox'}
        onClick={() => runWriterActionOrPlace('richTextBox', 'mainRichBox', 'Opening Writer rich box')}
        title={isBlankDocument ? 'Place a rich text box on the blank page' : 'Create or open the main Writer rich authoring box'}
      />
      <ResponsiveBtn
        icon={MessageSquareDot}
        label="Callout"
        disabled={!hasWriterSurface}
        active={isBlankDocument && activeWriterTool === 'textCallout'}
        onClick={() => runWriterActionOrPlace('textCallout', 'calloutSnippet', 'Inserting Writer callout')}
        title={isBlankDocument ? 'Place a callout on the blank page' : 'Insert a callout snippet inside the active Writer rich box'}
      />
      <ResponsiveBtn
        icon={Stamp}
        label="Stamp"
        disabled={!hasWriterSurface}
        active={isBlankDocument && activeWriterTool === 'textStamp'}
        onClick={() => runWriterActionOrPlace('textStamp', 'stampSnippet', 'Inserting Writer stamp')}
        title={isBlankDocument ? 'Place a stamp on the blank page' : 'Insert a stamp snippet inside the active Writer rich box'}
      />
      <ResponsiveBtn
        icon={Tag}
        label="Review"
        disabled={!hasWriterSurface}
        active={isBlankDocument && activeWriterTool === 'reviewLabel'}
        onClick={() => runWriterActionOrPlace('reviewLabel', 'reviewSnippet', 'Inserting Writer review')}
        title={isBlankDocument ? 'Place a review label on the blank page' : 'Insert a review snippet inside the active Writer rich box'}
      />
      <ResponsiveBtn
        icon={NotebookPen}
        label="Note"
        disabled={!hasWriterSurface}
        active={isBlankDocument && activeWriterTool === 'richNote'}
        onClick={() => runWriterActionOrPlace('richNote', 'noteSnippet', 'Inserting Writer note')}
        title={isBlankDocument ? 'Place a rich note on the blank page' : 'Insert a note snippet inside the active Writer rich box'}
      />
      <ResponsiveBtn
        icon={TableIcon}
        label="Table"
        disabled={!isBlankDocument}
        active={isBlankDocument && activeWriterTool === 'tableBox'}
        onClick={() => activateBlankPlacementTool('tableBox')}
        title={isBlankDocument ? 'Place a table on the blank page' : 'Open or create a blank Writer document to place tables'}
      />
      <WriterBlankImageInsertButton disabled={!isBlankDocument} />
      <WriterSelectionQuickActions />

      <ResponsiveBtn
        icon={Scan}
        label="Copy Region"
        disabled={isBlankDocument}
        active={activeWriterTool === 'selectBoxCopy'}
        onClick={() => setActiveWriterTool(activeWriterTool === 'selectBoxCopy' ? 'select' : 'selectBoxCopy')}
        title="Select Box Copy: copy text, formatted text, tables, or image from a rectangle"
      />
      <ResponsiveBtn
        icon={FileText}
        label="DOCX"
        disabled={!hasWriterSurface}
        onClick={() => {
          void runWithWriterPreflight('Writer DOCX', exportDocx);
        }}
        title="Export Writer V2 authored layer as Word DOCX"
      />
      <ResponsiveBtn
        icon={FileDown}
        label="Flatten"
        disabled={!sourceBytes && !isBlankDocument}
        onClick={() => {
          void runWithWriterPreflight('Flattened PDF', exportFlattenedPdf);
        }}
        title="Export Writer PDF (view-only, smaller)"
      />
      <ResponsiveBtn
        icon={FolderArchive}
        label="Save Project"
        disabled={!hasWriterSurface}
        onClick={() => {
          void runWithWriterPreflight('PDF Hub Project ZIP', exportProjectZip);
        }}
        title="Export editable PDF Hub project (.pdfhub.zip)"
      />
      <ResponsiveBtn
        icon={SlidersHorizontal}
        label="Tools"
        active={toolsHubOpen}
        onClick={toggleToolsHub}
        title="Toggle Writer Objects, Templates, and Search Hub"
      />
      <div className="relative" ref={moreMenuRef}>
        <ResponsiveBtn
          icon={MoreHorizontal}
          label="More"
          active={moreMenuOpen}
          onClick={() => setMoreMenuOpen((prev) => !prev)}
          title="More Writer exports, comments, and project import"
        />
        {moreMenuOpen && (
          <div
            role="menu"
            aria-label="More Writer tools and exports"
            className="absolute right-0 top-full mt-1 w-52 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-50"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!sourceBytes}
              onClick={() => {
                setMoreMenuOpen(false);
                void runWithWriterPreflight('Editable PDF', exportEditablePdf);
              }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              title="Save as editable .pdf - flattened for viewing, re-openable for editing in PDF Hub"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Editable PDF</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreMenuOpen(false);
                fileInputRef.current?.click();
              }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Open an editable .pdf or .pdfhub.zip project"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open Project</span>
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreMenuOpen(false);
                exportCommentSummary('csv');
              }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Comments CSV</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreMenuOpen(false);
                exportCommentSummary('markdown');
              }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Comments MD</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreMenuOpen(false);
                exportCommentSummary('json');
              }}
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Comments JSON</span>
            </button>
          </div>
        )}
      </div>

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

      <BlankDocumentCreateDialog
        open={blankDialogOpen}
        onCancel={() => setBlankDialogOpen(false)}
        onCreate={createBlankDocument}
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
