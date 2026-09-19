import React from 'react';

import type {
  HeaderFooterEditorDraft,
  HeaderFooterEditorImageDraft,
} from '@/core/header-footer/editorDraft';
import { useHeaderFooterImageResource } from './useHeaderFooterImageResource';

interface UseHeaderFooterImageEditorInput {
  isOpen: boolean;
  image: HeaderFooterEditorImageDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<HeaderFooterEditorDraft>>;
}

export function useHeaderFooterImageEditor({
  isOpen,
  image,
  setDraft,
}: UseHeaderFooterImageEditorInput) {
  const resource = useHeaderFooterImageResource(isOpen);

  const onFileSelected = React.useCallback(
    async (file: File) => {
      const admitted = await resource.admit(file);
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
    },
    [resource, setDraft],
  );

  const onChange = React.useCallback(
    (patch: Partial<HeaderFooterEditorImageDraft>) => {
      setDraft((current) => ({
        ...current,
        image: current.image
          ? { ...current.image, ...patch }
          : current.image,
      }));
    },
    [setDraft],
  );

  const onRemove = React.useCallback(() => {
    resource.clear();
    setDraft((current) => ({
      ...current,
      image: null,
    }));
  }, [resource, setDraft]);

  const binaryResources = React.useMemo<
    Readonly<Record<string, Uint8Array>> | undefined
  >(() => {
    if (
      !image
      || !resource.admitted
      || image.resourceId !== resource.admitted.resourceId
    ) {
      return undefined;
    }

    return {
      [image.resourceId]: resource.admitted.bytes,
    };
  }, [image, resource.admitted]);

  const imageUrls = React.useMemo<Readonly<Record<string, string>>>(() => {
    if (!image || !resource.previewUrl) return {};
    return {
      [image.resourceId]: resource.previewUrl,
    };
  }, [image, resource.previewUrl]);

  return {
    panelProps: {
      image,
      previewUrl: resource.previewUrl,
      busy: resource.busy,
      error: resource.error,
      onFileSelected: (file: File) => {
        void onFileSelected(file);
      },
      onChange,
      onRemove,
    },
    binaryResources,
    imageUrls,
    busy: resource.busy,
  };
}
