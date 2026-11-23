import React from 'react';
import { RotateCw, Scissors, Trash2, CopyPlus, Split, Hash, Heading, FilePlus, ListOrdered, GitMerge, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
  inspectAdmittedDonorPdfs,
  type AdmittedDonorPdf,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { InsertPdfDialog } from '@/components/dialogs/InsertPdfDialog';
import { ExtractPagesDialog } from '@/components/dialogs/ExtractPagesDialog';
import { PageLabelsDialog } from '@/components/dialogs/PageLabelsDialog';
import { CollatePdfDialog } from '@/components/dialogs/CollatePdfDialog';
import { NormalizePageSizeDialog } from '@/components/dialogs/NormalizePageSizeDialog';
import { createSimpleHeaderFooterTextTemplate } from '@/core/header-footer/simpleTextTemplate';
import { collatePdfDocuments } from '@/core/pdf-mutation/pdfCollation';
import { normalizePdfPageDimensions, type NormalizeOptions } from '@/core/pdf-mutation/pdfNormalization';
import { createSplitPagesZipBundle } from '@/core/pdf-mutation/pdfSplitBundle';

interface ThumbnailActionStripProps {
  selectedPages: number[];
  currentPage: number;
}

export const ThumbnailActionStrip: React.FC<ThumbnailActionStripProps> = ({
  selectedPages,
  currentPage,
}) => {
  const targetPages = selectedPages.length > 0 ? selectedPages : [currentPage];
  const { workingBytes, documentKey, fileName, pageGraph, pageCount } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    fileName: state.fileName,
    pageGraph: state.pageGraph,
    pageCount: state.pageCount,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const donorOperationRef = React.useRef<AbortController | null>(null);
  const [stagedInsert, setStagedInsert] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
  } | null>(null);
  const [extractDialogState, setExtractDialogState] = React.useState<{
    isOpen: boolean;
    initialMode: 'extract' | 'split';
  } | null>(null);
  const [isPageLabelsOpen, setIsPageLabelsOpen] = React.useState(false);
  const [stagedCollate, setStagedCollate] = React.useState<{
    donor: AdmittedDonorPdf;
    controller: AbortController;
    documentKey: string;
  } | null>(null);
  const [isNormalizeOpen, setIsNormalizeOpen] = React.useState(false);

  React.useEffect(() => () => {
    donorOperationRef.current?.abort('action strip unmounted');
    donorOperationRef.current = null;
  }, []);

  const pageIndices = targetPages.map((page) => page - 1);
  const targetPageIds = targetPages.flatMap((pageNumber) => {
    const pageId = pageGraph?.pages[pageNumber - 1]?.pageId;
    return pageId ? [pageId] : [];
  });

  const handleCommand = async (draft: PdfCommandDraft, successMessage?: string) => {
    if (!workingBytes || !documentKey) return;
    const result = await commandBus.execute({
      workingBytes,
      command: materializePdfCommand(
        draft,
        'thumbnail-menu',
        documentKey,
      ),
    });
    if (!result.success) {
      if (result.error?.code === 'CANCELLED') return;
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: result.error?.message ?? result.message,
      });
      return;
    }

    if (result.artifacts && result.artifacts.length > 0) {
      for (const artifact of result.artifacts) {
        if (artifact.kind !== 'pdf') continue;
        await FileAdapter.savePdfBytes(artifact.bytes, artifact.name, null);
      }
    }

    if (successMessage) {
      addToast({
        type: 'success',
        title: 'Action Complete',
        message: successMessage,
      });
    }
  };

  const handleInsertFromPdf = async () => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by newer action strip donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_ACTION_STRIP',
        'INSERT_PAGES',
        {
          signal: controller.signal,
          ownerDocumentKey: expectedDocumentKey,
          isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
        },
      );
      if (result.outcome !== 'ACCEPTED') {
        if (result.outcome !== 'CANCELLED') {
          addToast({
            type: 'error',
            title: 'Donor PDF Rejected',
            message: firstDonorAdmissionErrorMessage(result) ?? 'The donor PDF could not be admitted.',
          });
        }
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      setStagedInsert({
        donor,
        controller,
        documentKey: expectedDocumentKey,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const confirmInsertPdf = async (config: {
    donorPageIndices?: number[];
    placement: 'before' | 'after';
    targetPage: number;
  }) => {
    const staged = stagedInsert;
    if (!staged || !workingBytes || !documentKey) return;

    const atIndex = config.placement === 'before'
      ? config.targetPage - 1
      : config.targetPage;
    const count = config.donorPageIndices?.length ?? staged.donor.pageCount;

    try {
      const result = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'INSERT_PAGES',
            payload: {
              atIndex,
              donorResourceId: 'donor:0',
              donorPageIndices: config.donorPageIndices,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          donors: {
            'donor:0': staged.donor,
          },
        },
        signal: staged.controller.signal,
      });

      if (!result.success) {
        if (result.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Insert Action Failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Insert Complete',
        message: `Inserted ${count} page(s) from ${staged.donor.fileName} ${config.placement} page ${config.targetPage}.`,
      });
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
      setStagedInsert(null);
    }
  };

  const handleCollate = async () => {
    if (!workingBytes || !documentKey) return;
    donorOperationRef.current?.abort('superseded by newer action strip donor operation');
    const controller = new AbortController();
    donorOperationRef.current = controller;
    const expectedDocumentKey = documentKey;

    try {
      const sources = await FileAdapter.pickPdfFileSources(false);
      if (sources.length === 0) return;
      const result = await admitDonorPdfFiles(
        sources,
        'THUMBNAIL_ACTION_STRIP',
        'INSERT_PAGES',
        {
          signal: controller.signal,
          ownerDocumentKey: expectedDocumentKey,
          isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
        },
      );
      if (result.outcome !== 'ACCEPTED') {
        if (result.outcome !== 'CANCELLED') {
          addToast({
            type: 'error',
            title: 'Donor PDF Rejected',
            message: firstDonorAdmissionErrorMessage(result) ?? 'The donor PDF could not be admitted.',
          });
        }
        return;
      }
      assertAdmittedDonorSetDispatchAllowed(result.value, {
        signal: controller.signal,
        ownerDocumentKey: expectedDocumentKey,
        isContextCurrent: () => useSessionStore.getState().documentKey === expectedDocumentKey,
      });
      const donor = result.value.donors[0];
      setStagedCollate({
        donor,
        controller,
        documentKey: expectedDocumentKey,
      });
    } catch (error) {
      if (!isOperationCancelledError(error) && !controller.signal.aborted) {
        addToast({
          type: 'error',
          title: 'Donor PDF Admission Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (donorOperationRef.current === controller) {
        donorOperationRef.current = null;
      }
    }
  };

  const confirmCollatePdf = async (config: {
    mode: 'forward' | 'reverse-duplex';
    donorPageIndices?: number[];
  }) => {
    const staged = stagedCollate;
    if (!staged || !workingBytes || !documentKey) return;

    try {
      const resolved = inspectAdmittedDonorPdfs(
        'INSERT_PAGES',
        [staged.donor],
        staged.documentKey,
      );
      const collatedBytes = await collatePdfDocuments(
        workingBytes,
        resolved[0].bytes,
        {
          mode: config.mode,
          donorPageIndices: config.donorPageIndices,
          signal: staged.controller.signal,
        },
      );
      const newPageCount = (await (await import('@/core/pdf/lazyPdfLib')).pdfLib()).PDFDocument.load(collatedBytes).then(d => d.getPageCount());
      const resolvedCount = await newPageCount;

      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:collated',
              nextPageCount: resolvedCount,
              reason: `Collate with ${staged.donor.fileName} (${config.mode === 'reverse-duplex' ? 'Reverse Duplex' : 'Forward'})`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:collated': collatedBytes,
          },
        },
        signal: staged.controller.signal,
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Collation Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Collation Complete',
        message: `Collated with ${staged.donor.fileName} (${config.mode === 'reverse-duplex' ? 'Reverse Duplex' : 'Forward'}). Total pages: ${resolvedCount}.`,
      });
    } catch (error) {
      if (!isOperationCancelledError(error)) {
        addToast({
          type: 'error',
          title: 'Collation Failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (donorOperationRef.current === staged.controller) {
        donorOperationRef.current = null;
      }
      setStagedCollate(null);
    }
  };

  const confirmNormalizeDimensions = async (options: NormalizeOptions) => {
    if (!workingBytes || !documentKey) return;
    try {
      const result = await normalizePdfPageDimensions(workingBytes, options);
      const cmdResult = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'APPLY_WORKING_COPY',
            payload: {
              binaryResourceId: 'binary:normalized',
              nextPageCount: pageCount,
              reason: `Normalize page dimensions (${options.preset})`,
            },
          },
          'thumbnail-menu',
          documentKey,
        ),
        resources: {
          binaries: {
            'binary:normalized': result.normalizedBytes,
          },
        },
      });

      if (!cmdResult.success) {
        if (cmdResult.error?.code === 'CANCELLED') return;
        addToast({
          type: 'error',
          title: 'Normalization Failed',
          message: cmdResult.error?.message ?? cmdResult.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Normalization Complete',
        message: `Normalized ${result.modifiedPageCount} page(s) to ${options.preset}.`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Normalization Failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <>
      <div className="flex items-center space-x-1 p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 rounded-t-lg">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-2 flex-grow">
        {selectedPages.length > 0 ? `${selectedPages.length} selected` : 'Current page'}
      </span>
      <Tooltip content="Rotate">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'ROTATE_PAGES', payload: { pageIndices, angle: 90 } })}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Extract">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Extract pages"
          onClick={() => setExtractDialogState({ isOpen: true, initialMode: 'extract' })}
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Split">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Split pages"
          onClick={() => setExtractDialogState({ isOpen: true, initialMode: 'split' })}
        >
          <Split className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Duplicate">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => handleCommand({ type: 'DUPLICATE_PAGES', payload: { pageIndices } })}
        >
          <CopyPlus className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Insert PDF from file">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Insert PDF from file"
          onClick={() => void handleInsertFromPdf()}
          disabled={!workingBytes}
        >
          <FilePlus className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Collate with PDF">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Collate with PDF"
          onClick={() => void handleCollate()}
          disabled={!workingBytes}
        >
          <GitMerge className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Normalize page dimensions">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Normalize page dimensions"
          onClick={() => setIsNormalizeOpen(true)}
          disabled={!workingBytes}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => handleCommand({ type: 'DELETE_PAGES', payload: { pageIndices } })}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Page numbers">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Page numbers"
          onClick={() => {
            if (targetPageIds.length !== targetPages.length) return;
            handleCommand({
              type: 'APPLY_HEADER_FOOTER_TEMPLATE',
              payload: {
                template: createSimpleHeaderFooterTextTemplate({
                  name: 'Thumbnail page numbers',
                  selector: {
                    include: {
                      mode: 'pageIds',
                      pageIds: targetPageIds,
                    },
                  },
                  zone: 'footer',
                  text: 'Page {{physicalPage}} of {{pageCount}}',
                  align: 'center',
                  marginXPt: 24,
                  marginYPt: 20,
                  fontSizePt: 10,
                  color: '#475569',
                  opacity: 0.9,
                }),
              },
            });
          }}
        >
          <Hash className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Page labels">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Page labels"
          onClick={() => setIsPageLabelsOpen(true)}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="Header file name">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Header file name"
          onClick={() => {
            if (targetPageIds.length !== targetPages.length) return;
            handleCommand({
              type: 'APPLY_HEADER_FOOTER_TEMPLATE',
              payload: {
                template: createSimpleHeaderFooterTextTemplate({
                  name: 'Thumbnail file header',
                  selector: {
                    include: {
                      mode: 'pageIds',
                      pageIds: targetPageIds,
                    },
                  },
                  zone: 'header',
                  text: '{{fileName}}',
                  align: 'right',
                  marginXPt: 24,
                  marginYPt: 18,
                  fontSizePt: 10,
                  color: '#334155',
                  opacity: 0.85,
                }),
              },
            });
          }}
        >
          <Heading className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
    </div>
    {stagedInsert && (
      <InsertPdfDialog
        isOpen={true}
        donorFileName={stagedInsert.donor.fileName}
        donorPageCount={stagedInsert.donor.pageCount}
        currentPage={targetPages[0]}
        totalDocumentPages={pageCount}
        initialPlacement="after"
        onClose={() => {
          stagedInsert.controller.abort('insert dialog closed');
          setStagedInsert(null);
        }}
        onConfirm={confirmInsertPdf}
      />
    )}
    {extractDialogState && (
      <ExtractPagesDialog
        isOpen={true}
        documentFileName={fileName ?? 'document.pdf'}
        currentPage={targetPages[0] ?? 1}
        totalDocumentPages={pageCount}
        selectedPages={targetPages}
        initialMode={extractDialogState.initialMode}
        onClose={() => setExtractDialogState(null)}
        onConfirm={async ({ pageIndices: selectedIndices, mode, outputFileName, packageAsZip }) => {
          setExtractDialogState(null);
          if (packageAsZip && workingBytes) {
            try {
              const zipResult = await createSplitPagesZipBundle(
                workingBytes,
                selectedIndices,
                outputFileName,
              );
              await FileAdapter.savePdfBytes(zipResult.zipBytes, outputFileName, null);
              if (mode === 'split') {
                await handleCommand(
                  {
                    type: 'DELETE_PAGES',
                    payload: { pageIndices: selectedIndices },
                  },
                  `Split ${selectedIndices.length} page(s) into ${outputFileName} and removed from original.`,
                );
              } else {
                addToast({
                  type: 'success',
                  title: 'Pages Packaged',
                  message: `Packaged ${selectedIndices.length} page(s) into ${outputFileName}.`,
                });
              }
            } catch (err) {
              addToast({
                type: 'error',
                title: 'Packaging Failed',
                message: err instanceof Error ? err.message : String(err),
              });
            }
            return;
          }
          const commandType = mode === 'split' ? 'SPLIT_PAGES' : 'EXTRACT_PAGES';
          const successMsg = mode === 'split'
            ? `Split ${selectedIndices.length} page(s) into ${outputFileName}.`
            : `Extracted ${selectedIndices.length} page(s) to ${outputFileName}.`;
          await handleCommand(
            {
              type: commandType,
              payload: { pageIndices: selectedIndices, outputName: outputFileName },
            },
            successMsg,
          );
        }}
      />
    )}
    {stagedCollate && (
      <CollatePdfDialog
        isOpen={true}
        primaryFileName={fileName ?? 'document.pdf'}
        primaryPageCount={pageCount}
        donorFileName={stagedCollate.donor.fileName}
        donorPageCount={stagedCollate.donor.pageCount}
        onClose={() => {
          stagedCollate.controller.abort('collate dialog closed');
          setStagedCollate(null);
        }}
        onConfirm={confirmCollatePdf}
      />
    )}
    {isNormalizeOpen && (
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={pageCount}
        selectedPages={targetPages}
        currentPage={targetPages[0] ?? 1}
        onClose={() => setIsNormalizeOpen(false)}
        onConfirm={confirmNormalizeDimensions}
      />
    )}
    {isPageLabelsOpen && pageGraph && (
      <PageLabelsDialog
        isOpen={true}
        pageGraph={pageGraph}
        currentPageId={pageGraph.pages[(targetPages[0] ?? 1) - 1]?.pageId ?? null}
        selectedPageIds={targetPageIds}
        onClose={() => setIsPageLabelsOpen(false)}
        onApply={async (ranges) => {
          if (!documentKey) return false;
          const result = await commandBus.execute({
            command: materializePdfCommand(
              {
                type: 'SET_PAGE_LABELS',
                payload: { ranges },
              },
              'thumbnail-menu',
              documentKey,
            ),
          });
          if (result.success) {
            addToast({
              type: 'success',
              title: 'Page Labels',
              message: 'Updated logical page labels.',
            });
          }
          return result.success;
        }}
      />
    )}
  </>
  );
};
