import React from 'react';

import {
  admitHeaderFooterImageFile,
  type AdmittedHeaderFooterImage,
} from '@/core/header-footer/imageAdmission';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';

export interface HeaderFooterImageResourceState {
  admitted: AdmittedHeaderFooterImage | null;
  previewUrl: string | null;
  busy: boolean;
  error: string | null;
  admit: (file: File) => Promise<AdmittedHeaderFooterImage | null>;
  clear: () => void;
}

export function useHeaderFooterImageResource(
  isOpen: boolean,
): HeaderFooterImageResourceState {
  const [admitted, setAdmitted] =
    React.useState<AdmittedHeaderFooterImage | null>(null);
  const [previewUrl, setPreviewUrl] =
    React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);

  const releasePreview = React.useCallback(() => {
    const url = previewUrlRef.current;
    if (url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const clear = React.useCallback(() => {
    controllerRef.current?.abort('header/footer image cleared');
    controllerRef.current = null;
    releasePreview();
    setAdmitted(null);
    setBusy(false);
    setError(null);
  }, [releasePreview]);

  React.useEffect(() => {
    if (!isOpen) clear();
    return () => {
      controllerRef.current?.abort('header/footer image UI disposed');
    };
  }, [clear, isOpen]);

  React.useEffect(
    () => () => {
      const url = previewUrlRef.current;
      if (url && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  const admit = React.useCallback(
    async (file: File): Promise<AdmittedHeaderFooterImage | null> => {
      controllerRef.current?.abort('superseded header/footer image');
      const controller = new AbortController();
      controllerRef.current = controller;
      setBusy(true);
      setError(null);

      try {
        const next = await admitHeaderFooterImageFile(
          file,
          controller.signal,
        );
        if (controllerRef.current !== controller) return null;

        releasePreview();
        let nextPreviewUrl: string | null = null;
        if (typeof URL.createObjectURL === 'function') {
          nextPreviewUrl = URL.createObjectURL(
            new Blob([next.bytes.slice()], { type: next.mimeType }),
          );
        }

        previewUrlRef.current = nextPreviewUrl;
        setPreviewUrl(nextPreviewUrl);
        setAdmitted(next);
        return next;
      } catch (caught) {
        if (
          isOperationCancelledError(caught)
          || controller.signal.aborted
        ) {
          return null;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setBusy(false);
        }
      }
    },
    [releasePreview],
  );

  return {
    admitted,
    previewUrl,
    busy,
    error,
    admit,
    clear,
  };
}
