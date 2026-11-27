import React from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import {
  compileHeaderFooterEditorDraft,
  createDefaultHeaderFooterEditorDraft,
  type HeaderFooterEditorDraft,
} from '@/core/header-footer/editorDraft';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import { resolveHeaderFooterTemplate } from '@/core/header-footer/resolver';
import {
  applyPrintedNumberingPresetToDraft,
  printedNumberingPreset,
  type PrintedNumberingPresetId,
} from '@/core/header-footer/numberingPresets';
import {
  HeaderFooterSlotGrid,
  type HeaderFooterEditorSlotKey,
} from './header-footer/HeaderFooterSlotGrid';
import { HeaderFooterOptionsPanel } from './header-footer/HeaderFooterOptionsPanel';
import { HeaderFooterTokenBar } from './header-footer/HeaderFooterTokenBar';
import { HeaderFooterNumberingPresetBar } from './header-footer/HeaderFooterNumberingPresetBar';
import { HeaderFooterPreviewPane } from './header-footer/HeaderFooterPreviewPane';
import { HeaderFooterImagePanel } from './header-footer/HeaderFooterImagePanel';
import { useHeaderFooterImageEditor } from './header-footer/useHeaderFooterImageEditor';
import { renderHeaderFooterNativePreview } from '@/core/header-footer/nativePreview';
import { useSessionStore } from '@/core/session/store';

interface HeaderFooterDialogProps {
  isOpen: boolean;
  pageGraph: PageGraph<PageNode>;
  currentPageId: PageId | null;
  selectedPageIds: PageId[];
  fileName: string;
  onClose: () => void;
  onApply: (
    template: HeaderFooterTemplate,
    binaryResources?: Readonly<Record<string, Uint8Array>>,
  ) => Promise<boolean>;
}

export const HeaderFooterDialog: React.FC<
  HeaderFooterDialogProps
> = ({
  isOpen,
  pageGraph,
  currentPageId,
  selectedPageIds,
  fileName,
  onClose,
  onApply,
}) => {
  const [draft, setDraft] = React.useState<HeaderFooterEditorDraft>(
    createDefaultHeaderFooterEditorDraft,
  );
  const [activeSlot, setActiveSlot] =
    React.useState<HeaderFooterEditorSlotKey>('footer.right');
  const [selectedPreviewPageId, setSelectedPreviewPageId] =
    React.useState<PageId | null>(null);
  const [previewNow, setPreviewNow] = React.useState(
    () => new Date(),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const workingBytes = useSessionStore((state) => state.workingBytes);
  const [nativePreview, setNativePreview] = React.useState<{
    imageUrl: string | null;
    busy: boolean;
    error: string | null;
    warnings: string[];
  }>({ imageUrl: null, busy: false, error: null, warnings: [] });
  const previewAbortRef = React.useRef<AbortController | null>(null);
  const imageEditor = useHeaderFooterImageEditor({
    isOpen,
    image: draft.image,
    setDraft,
  });

  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setDraft(createDefaultHeaderFooterEditorDraft());
      setActiveSlot('footer.right');
      setSelectedPreviewPageId(currentPageId);
      setPreviewNow(new Date());
      setSubmitting(false);
    }
  }

  const preview = React.useMemo(() => {
    try {
      const template = compileHeaderFooterEditorDraft(draft, {
        pageGraph,
        currentPageId,
        selectedPageIds,
        previewTime: previewNow,
      });
      const resolution = resolveHeaderFooterTemplate(
        template,
        pageGraph,
        {
          fileName,
          now: previewNow,
        },
      );

      if (!resolution.ok) {
        return {
          template: null,
          pages: [],
          warnings: resolution.warnings,
          error: resolution.errors.join(' '),
        };
      }

      return {
        template,
        pages: resolution.pages.filter(
          (page) => Boolean(page.header || page.footer),
        ),
        warnings: resolution.warnings,
        error: null,
      };
    } catch (error) {
      return {
        template: null,
        pages: [],
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [
    currentPageId,
    draft,
    fileName,
    pageGraph,
    previewNow,
    selectedPageIds,
  ]);

  const previewPageId = React.useMemo<PageId | null>(() => {
    if (preview.pages.length === 0) {
      return null;
    }
    if (
      selectedPreviewPageId
      && preview.pages.some((page) => page.pageId === selectedPreviewPageId)
    ) {
      return selectedPreviewPageId;
    }
    const currentMatched = currentPageId
      ? preview.pages.find((page) => page.pageId === currentPageId)
      : null;
    return currentMatched?.pageId ?? preview.pages[0]?.pageId ?? null;
  }, [currentPageId, preview.pages, selectedPreviewPageId]);

  const [prevNativeInputs, setPrevNativeInputs] = React.useState({
    isOpen,
    template: preview.template,
    previewPageId,
    workingBytes,
    binaryResources: imageEditor.binaryResources,
  });
  if (
    prevNativeInputs.isOpen !== isOpen
    || prevNativeInputs.template !== preview.template
    || prevNativeInputs.previewPageId !== previewPageId
    || prevNativeInputs.workingBytes !== workingBytes
    || prevNativeInputs.binaryResources !== imageEditor.binaryResources
  ) {
    setPrevNativeInputs({
      isOpen,
      template: preview.template,
      previewPageId,
      workingBytes,
      binaryResources: imageEditor.binaryResources,
    });
    setNativePreview({ imageUrl: null, busy: false, error: null, warnings: [] });
  }

  // Invalidate prior pixels on any edit, selected page change or source update.
  React.useEffect(() => {
    previewAbortRef.current?.abort('Native preview inputs changed');
    return () => {
      previewAbortRef.current?.abort('Native preview closed or superseded');
    };
  }, [
    isOpen, preview.template, previewPageId, workingBytes,
    imageEditor.binaryResources,
  ]);

  const renderNative = async () => {
    if (!isOpen || !workingBytes || !preview.template || !previewPageId) return;
    const selected = preview.pages.find((page) => page.pageId === previewPageId);
    if (!selected) return;
    previewAbortRef.current?.abort('Native preview superseded');
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setNativePreview({ imageUrl: null, busy: true, error: null, warnings: [] });
    try {
      const result = await renderHeaderFooterNativePreview({
        baseBytes: workingBytes,
        pageGraph,
        template: preview.template,
        context: { fileName, now: previewNow },
        binaryResources: imageEditor.binaryResources,
        physicalPageNumber: selected.physicalPageNumber,
        signal: controller.signal,
      });
      if (previewAbortRef.current === controller && !controller.signal.aborted) {
        setNativePreview({
          imageUrl: result.dataUrl,
          busy: false,
          error: null,
          warnings: result.warnings,
        });
      }
    } catch (error) {
      if (previewAbortRef.current === controller && !controller.signal.aborted) {
        setNativePreview({
          imageUrl: null,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
          warnings: [],
        });
      }
    }
  };

  const patchDraft = (
    patch: Partial<HeaderFooterEditorDraft>,
  ) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateSlot = (
    band: 'header' | 'footer',
    slot: 'left' | 'center' | 'right',
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      [band]: {
        ...current[band],
        [slot]: value,
      },
    }));
  };

  const insertToken = (token: string) => {
    const [band, slot] = activeSlot.split('.') as [
      'header' | 'footer',
      'left' | 'center' | 'right',
    ];
    const current = draft[band][slot];
    const separator =
      current.length > 0 && !/\s$/.test(current) ? ' ' : '';
    updateSlot(band, slot, `${current}${separator}${token}`);
  };

  const applyNumberingPreset = (
    presetId: PrintedNumberingPresetId,
  ) => {
    const preset = printedNumberingPreset(presetId);
    if (
      draft.image?.band === 'footer'
      && draft.image.slot === preset.slot
    ) {
      imageEditor.panelProps.onRemove();
    }
    setDraft((current) =>
      applyPrintedNumberingPresetToDraft(current, presetId),
    );
  };

  const handleApply = async () => {
    if (!preview.template || preview.error) return;
    setSubmitting(true);
    try {
      const applied = await onApply(
        preview.template,
        imageEditor.binaryResources,
      );
      if (applied) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const hasPageLabelSections =
    (pageGraph.pageLabelRanges?.length ?? 0) > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Header & Footer"
      size="2xl"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          This adds visible printed content. Logical PDF PageLabels remain
          unchanged.
        </div>

        <HeaderFooterSlotGrid
          header={draft.header}
          footer={draft.footer}
          activeSlot={activeSlot}
          onActiveSlotChange={setActiveSlot}
          onChange={updateSlot}
        />

        <HeaderFooterNumberingPresetBar
          onApply={applyNumberingPreset}
        />

        <HeaderFooterTokenBar onInsert={insertToken} />

        <HeaderFooterImagePanel {...imageEditor.panelProps} />

        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <HeaderFooterOptionsPanel
            draft={draft}
            hasSelection={selectedPageIds.length > 0}
            hasPageLabelSections={hasPageLabelSections}
            onChange={patchDraft}
          />
        </div>

        <HeaderFooterPreviewPane
          pages={preview.pages}
          pageGraph={pageGraph}
          previewPageId={previewPageId}
          error={preview.error}
          warnings={preview.warnings}
          nativeImageUrl={nativePreview.imageUrl}
          nativeBusy={nativePreview.busy}
          nativeError={nativePreview.error}
          nativeWarnings={nativePreview.warnings}
          nativeAvailable={Boolean(workingBytes) && !imageEditor.busy && !submitting}
          onRenderNativePreview={() => void renderNative()}
          onPreviewPageChange={setSelectedPreviewPageId}
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleApply()}
            disabled={
              submitting
              || imageEditor.busy
              || Boolean(preview.error)
              || !preview.template
              || preview.pages.length === 0
            }
          >
            {submitting ? 'Applying…' : 'Apply header & footer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
