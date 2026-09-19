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
  HeaderFooterSlotGrid,
  type HeaderFooterEditorSlotKey,
} from './header-footer/HeaderFooterSlotGrid';
import { HeaderFooterOptionsPanel } from './header-footer/HeaderFooterOptionsPanel';
import { HeaderFooterTokenBar } from './header-footer/HeaderFooterTokenBar';
import { HeaderFooterPreviewPane } from './header-footer/HeaderFooterPreviewPane';
import { HeaderFooterImagePanel } from './header-footer/HeaderFooterImagePanel';
import { useHeaderFooterImageResource } from './header-footer/useHeaderFooterImageResource';

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
  const [previewPageId, setPreviewPageId] =
    React.useState<PageId | null>(null);
  const [previewNow, setPreviewNow] = React.useState(
    () => new Date(),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const imageResource = useHeaderFooterImageResource(isOpen);

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft(createDefaultHeaderFooterEditorDraft());
    setActiveSlot('footer.right');
    setPreviewPageId(currentPageId);
    setPreviewNow(new Date());
    setSubmitting(false);
  }, [currentPageId, isOpen]);

  const preview = React.useMemo(() => {
    try {
      const template = compileHeaderFooterEditorDraft(draft, {
        pageGraph,
        currentPageId,
        selectedPageIds,
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

  React.useEffect(() => {
    if (preview.pages.length === 0) {
      setPreviewPageId(null);
      return;
    }

    if (
      previewPageId
      && preview.pages.some((page) => page.pageId === previewPageId)
    ) {
      return;
    }

    const currentMatched = currentPageId
      ? preview.pages.find((page) => page.pageId === currentPageId)
      : null;
    setPreviewPageId(
      currentMatched?.pageId ?? preview.pages[0]?.pageId ?? null,
    );
  }, [currentPageId, preview.pages, previewPageId]);

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

  const handleImageFileSelected = async (file: File) => {
    const admitted = await imageResource.admit(file);
    if (!admitted) return;

    setDraft((current) => ({
      ...current,
      image: {
        resourceId: admitted.resourceId,
        fileName: admitted.fileName,
        band: current.image?.band ?? 'header',
        slot: current.image?.slot ?? 'left',
        widthPt: current.image?.widthPt ?? 48,
        altText: admitted.fileName,
      },
    }));
  };

  const handleRemoveImage = () => {
    imageResource.clear();
    setDraft((current) => ({
      ...current,
      image: null,
    }));
  };

  const handleApply = async () => {
    if (!preview.template || preview.error) return;
    setSubmitting(true);
    try {
      const binaries =
        draft.image
        && imageResource.admitted
        && draft.image.resourceId === imageResource.admitted.resourceId
          ? {
              [draft.image.resourceId]: imageResource.admitted.bytes,
            }
          : undefined;
      const applied = await onApply(preview.template, binaries);
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

        <HeaderFooterTokenBar onInsert={insertToken} />

        <HeaderFooterImagePanel
          image={draft.image}
          previewUrl={imageResource.previewUrl}
          busy={imageResource.busy}
          error={imageResource.error}
          onFileSelected={(file) => void handleImageFileSelected(file)}
          onChange={(patch) =>
            setDraft((current) => ({
              ...current,
              image: current.image
                ? { ...current.image, ...patch }
                : current.image,
            }))
          }
          onRemove={handleRemoveImage}
        />

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
          imageUrls={
            draft.image && imageResource.previewUrl
              ? { [draft.image.resourceId]: imageResource.previewUrl }
              : {}
          }
          onPreviewPageChange={setPreviewPageId}
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
              || imageResource.busy
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
