/**
 * useMockPdf.ts
 *
 * Generates and opens the benchmark PDF in the current session.
 * Returns a loading flag so the caller can show a spinner.
 *
 * INV-11 compliant: uses log() from core/logger, no console.log.
 */

import { useState, useCallback } from 'react';
import { generateMockPdf } from '@/core/mock/mockPdfGenerator';
import { useSessionStore } from '@/core/session/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { log, error as logError } from '@/core/logger/service';

export function useMockPdf(): { openMockPdf: () => Promise<void>; loading: boolean } {
  const [loading, setLoading] = useState(false);
  const openDocument = useSessionStore((state) => state.openDocument);

  const openMockPdf = useCallback(async () => {
    setLoading(true);
    try {
      log('session', 'Generating mock benchmark PDF');
      const bytes = await generateMockPdf();
      const safeBytes = new Uint8Array(bytes);
      const [pageCount, documentKey] = await Promise.all([
        PdfEditAdapter.countPages(safeBytes),
        FileAdapter.hashBytes(safeBytes),
      ]);

      openDocument({
        documentKey,
        fileName: 'doccraft-benchmark.pdf',
        bytes: safeBytes,
        pageCount,
      });

      log('session', 'Mock benchmark PDF opened', { pageCount, documentKey });
    } catch (err) {
      logError('system', 'Failed to generate mock PDF', { error: String(err) });
    } finally {
      setLoading(false);
    }
  }, [openDocument]);

  return { openMockPdf, loading };
}
