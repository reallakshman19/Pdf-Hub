import { AnnotationOverlay } from './AnnotationOverlay';
import React, { useRef, useEffect, useState } from 'react';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PDFPageProxy, PDFDocumentProxy } from 'pdfjs-dist';
import { TextLayer } from './TextLayer';

interface PageCanvasProps {
  pageNumber: number;
  pdfDoc: PDFDocumentProxy; // PDFDocumentProxy
  scale: number;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({ pageNumber, pdfDoc, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
      } else {
        // We could unload the page proxy here to free memory,
        // but virtua already unmounts the whole component when it's > 1 page away.
      }
    }, { rootMargin: '100% 0px' }); // Render 1 viewport ahead

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (isVisible && pdfDoc && canvasRef.current && !pageProxy) {
      pdfDoc.getPage(pageNumber).then((page: PDFPageProxy) => {
        if (!mounted) return;
        setPageProxy(page);
        PdfRendererAdapter.renderPage(page, scale, canvasRef.current!);
      });
    }
    return () => { mounted = false; };
  }, [isVisible, pdfDoc, pageNumber, scale, pageProxy]);

  // Recalculate dimensions to avoid layout shifts while loading
  const getPlaceholderStyle = () => {
    if (!pdfDoc) return { width: 800 * scale, height: 1100 * scale }; // Arbitrary fallback
    // Could get actual page dimensions from pdfDoc metadata if we pre-fetched them
    return {};
  };

  return (
    <div
      ref={containerRef}
      className="relative mb-6 mx-auto bg-white shadow-md border border-slate-200 dark:border-slate-700"
      style={getPlaceholderStyle()}
      data-testid={`page-canvas-${pageNumber}`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      {pageProxy && <AnnotationOverlay pageNumber={pageNumber} width={width} height={height} scale={scale} />
        <TextLayer page={pageProxy} scale={scale} />}
    </div>
  );
};
