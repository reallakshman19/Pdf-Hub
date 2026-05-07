import React, { useEffect, useState, useRef } from 'react';
import { VList } from 'virtua';
import { useSessionStore } from '@/core/session/store';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { PageCanvas } from './PageCanvas';
import { Loader2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PdfViewerProps {
  fileBuffer: ArrayBuffer;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ fileBuffer }) => {
  const { viewState, setPage } = useSessionStore();
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    
    PdfRendererAdapter.loadDocument(fileBuffer)
      .then(doc => {
        if (mounted) {
          setPdfDoc(doc);
          useSessionStore.getState().openDocument('temp-id', 'document.pdf', doc.numPages);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (pdfDoc) pdfDoc.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileBuffer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pdfDoc || !scrollRef.current) return;
      
      const pageHeight = 1000 * (viewState.zoom / 100); // Approx

      if (e.key === 'ArrowDown') {
        scrollRef.current.scrollBy({ top: 50, behavior: 'auto' });
      } else if (e.key === 'ArrowUp') {
        scrollRef.current.scrollBy({ top: -50, behavior: 'auto' });
      } else if (e.key === 'PageDown') {
        scrollRef.current.scrollBy({ top: pageHeight, behavior: 'smooth' });
      } else if (e.key === 'PageUp') {
        scrollRef.current.scrollBy({ top: -pageHeight, behavior: 'smooth' });
      } else if (e.key === 'Home') {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'End') {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfDoc, viewState.zoom]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!pdfDoc) {
    return <div className="flex justify-center p-8">Failed to load PDF.</div>;
  }

  const pages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
  const scale = viewState.zoom / 100;

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-auto h-full w-full bg-slate-200 dark:bg-slate-950 p-4 outline-none"
      tabIndex={0}
      onScroll={(e) => {
        // Very basic page tracking based on scroll
        // A robust implementation would use IntersectionObserver on pages
        if (e.currentTarget.scrollTop === 0) setPage(1);
      }}
    >
      <VList 
        className="mx-auto" 
        style={{ width: '100%', maxWidth: '1200px' }}
        shift={true} // Only visible pages ± 1
      >
        {pages.map((pageNum) => (
          <PageCanvas 
            key={pageNum} 
            pageNumber={pageNum} 
            pdfDoc={pdfDoc} 
            scale={scale} 
          />
        ))}
      </VList>
    </div>
  );
};
