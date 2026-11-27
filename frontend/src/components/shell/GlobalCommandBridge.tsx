import React from 'react';
import {
  openPdfFromPicker,
  performEditablePdfSave,
} from '@/core/document/fileSaveWorkflow';
import { printCurrentDocument } from '@/core/document/printPdfWorkflow';
import {
  queuePendingOrganizeAction,
  type OrganizeQuickAction,
} from '@/core/pdf-mutation/organizeWorkflowActions';
import {
  captureDocumentMutationOwner,
  isDocumentMutationOwnerCurrent,
  type DocumentMutationOwner,
} from '@/core/session/mutationOwner';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useCalloutStore } from '@/core/callout/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useToastStore } from '@/core/toast/store';
import { warn } from '@/core/logger/service';
import {
  inspectPdfSignatureRisk,
  type PdfSignatureRiskStatus,
} from '@/core/pdf-signatures/signatureRisk';
import { SignedPdfRewriteWarningDialog } from '@/components/toolbar/SignedPdfRewriteWarningDialog';
import { BlankDocumentCreateDialog } from '@/components/writer-v2/BlankDocumentCreateDialog';
import { ensureRichTextEditing } from '@/core/writer-v2/ensureRichTextEditing';
import { exportCurrentWriterPdf } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import {
  downloadWriterBytes,
  safeDownloadBaseName,
} from '@/core/writer-v2/export/downloadWriterFile';
import { HelpModal } from './HelpModal';
import type { ActiveMode, ActiveTool } from '@/core/editor/types';
import type { WriterPageSetupV2 } from '@/core/writer-v2/types';

const DRAW_MODE_TOOLS = new Set<ActiveTool>([
  'ink',
  'textbox',
  'shape-rect',
  'shape-ellipse',
  'shape-polygon',
  'shape-cloud',
  'line',
  'arrow',
]);

function modeForTool(tool: ActiveTool): ActiveMode {
  if (tool === 'select' || tool === 'hand') return 'view';
  return DRAW_MODE_TOOLS.has(tool) ? 'draw' : 'annotate';
}

export const GlobalCommandBridge: React.FC = () => {
  const addToast = useToastStore((state) => state.addToast);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [blankOpen, setBlankOpen] = React.useState(false);
  const [signatureWarning, setSignatureWarning] = React.useState<{
    status: Extract<PdfSignatureRiskStatus, 'SIGNED' | 'UNKNOWN'>;
    signatureCount: number;
    owner: DocumentMutationOwner;
  } | null>(null);
  const savePreflightSequence = React.useRef(0);

  React.useEffect(() => {
    const onOpen = () => {
      void openPdfFromPicker(addToast);
    };

    const onSave = () => {
      const writer = useWriterV2Store.getState();
      if (writer.documentMeta?.mode === 'blankDocument') {
        void (async () => {
          try {
            const bytes = await exportCurrentWriterPdf({});
            const base = safeDownloadBaseName(writer.documentMeta?.title);
            downloadWriterBytes(bytes, `${base}.writer-flattened.pdf`, 'application/pdf');
            useSessionStore.getState().completeSaveOperation('Blank Writer PDF exported.');
          } catch (error) {
            useSessionStore.getState().failSaveOperation(
              error instanceof Error ? error.message : String(error),
            );
          }
        })();
        return;
      }

      const owner = captureDocumentMutationOwner();
      const workingBytes = owner.session.workingBytes;
      if (!workingBytes || !owner.session.fileName) {
        addToast({
          type: 'info',
          title: 'No Document Open',
          message: 'Open a PDF or start a blank document before saving.',
        });
        return;
      }
      if (owner.session.isEncryptedSource) {
        addToast({
          type: 'info',
          title: 'Password-Protected PDF',
          message: 'Encrypted source PDFs can be viewed, searched, and printed, but cannot be natively rewritten on Save.',
        });
        return;
      }

      const sequence = ++savePreflightSequence.current;
      void inspectPdfSignatureRisk(workingBytes).then((risk) => {
        if (sequence !== savePreflightSequence.current || !isDocumentMutationOwnerCurrent(owner)) return;
        if (risk.status === 'SIGNED' || risk.status === 'UNKNOWN') {
          if (risk.status === 'UNKNOWN') {
            warn('session', 'Unable to determine PDF signature state before Save', {
              reason: risk.reason,
              fileName: owner.session.fileName,
            });
          }
          setSignatureWarning({
            status: risk.status,
            signatureCount: risk.signatureCount,
            owner,
          });
          return;
        }
        void performEditablePdfSave(owner, addToast);
      });
    };

    const onTool = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      if (!detail) return;

      const session = useSessionStore.getState();
      const isBlank = useWriterV2Store.getState().documentMeta?.mode === 'blankDocument';
      if (!session.workingBytes && !isBlank) {
        addToast({
          type: 'info',
          title: 'Open a Document First',
          message: 'Open a PDF or create a blank document to use workspace tools.',
        });
        return;
      }

      if (detail === 'writer-rich-box') {
        useEditorStore.getState().setActiveMode('write');
        useEditorStore.getState().setActiveTool('select');
        useCalloutStore.getState().setActiveTool('select');
        if (!useWriterV2Store.getState().currentDocumentFingerprint && session.documentKey) {
          useWriterV2Store.getState().hydrateWriterSession({
            documentFingerprint: session.documentKey,
            elements: [],
          });
        }
        void ensureRichTextEditing({ starterTemplate: 'authoringCard' });
        return;
      }

      const tool = detail as ActiveTool;
      useCalloutStore.getState().setActiveTool('select');
      useWriterV2Store.getState().setActiveWriterTool('select');
      useEditorStore.getState().setActiveMode(modeForTool(tool));
      useEditorStore.getState().setActiveTool(tool);
    };

    const onHelp = () => {
      setHelpOpen(true);
    };

    const onNewBlank = () => {
      setBlankOpen(true);
    };

    const onPrint = () => {
      void printCurrentDocument(addToast);
    };

    const onOrganizeAction = (event: Event) => {
      const action = (event as CustomEvent<OrganizeQuickAction | undefined>).detail;
      if (!action) return;
      const editor = useEditorStore.getState();
      if (editor.activeMode !== 'organize') {
        queuePendingOrganizeAction(action);
        editor.setActiveMode('organize');
      }
    };

    document.addEventListener('pdf-hub:open', onOpen);
    document.addEventListener('pdf-hub:save', onSave);
    document.addEventListener('pdf-hub:print', onPrint);
    document.addEventListener('pdf-hub:organize-action', onOrganizeAction);
    document.addEventListener('pdf-hub:tool', onTool);
    document.addEventListener('pdf-hub:help', onHelp);
    document.addEventListener('pdf-hub:new-blank', onNewBlank);

    return () => {
      document.removeEventListener('pdf-hub:open', onOpen);
      document.removeEventListener('pdf-hub:save', onSave);
      document.removeEventListener('pdf-hub:print', onPrint);
      document.removeEventListener('pdf-hub:organize-action', onOrganizeAction);
      document.removeEventListener('pdf-hub:tool', onTool);
      document.removeEventListener('pdf-hub:help', onHelp);
      document.removeEventListener('pdf-hub:new-blank', onNewBlank);
    };
  }, [addToast]);

  const handleCreateBlank = (input: {
    title: string;
    pageSetup: WriterPageSetupV2;
    pageCount: number;
  }) => {
    const meta = useWriterV2Store.getState().createBlankWriterDocument(input);
    useSessionStore.getState().clearDocument();
    useEditorStore.getState().setActiveMode('write');
    setBlankOpen(false);
    useSessionStore.getState().completeSaveOperation(
      `Blank Writer document created: ${meta.title ?? 'Untitled document'}.`,
    );
  };

  return (
    <>
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <BlankDocumentCreateDialog
        open={blankOpen}
        onCancel={() => setBlankOpen(false)}
        onCreate={handleCreateBlank}
      />
      {signatureWarning ? (
        <SignedPdfRewriteWarningDialog
          status={signatureWarning.status}
          signatureCount={signatureWarning.signatureCount}
          onCancel={() => {
            savePreflightSequence.current += 1;
            setSignatureWarning(null);
          }}
          onContinue={() => {
            const owner = signatureWarning.owner;
            savePreflightSequence.current += 1;
            setSignatureWarning(null);
            if (isDocumentMutationOwnerCurrent(owner)) {
              void performEditablePdfSave(owner, addToast);
            }
          }}
        />
      ) : null}
    </>
  );
};
