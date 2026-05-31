import { create } from 'zustand';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PdfStore {
  pdfDoc: PDFDocumentProxy | null;
  setPdfDoc: (doc: PDFDocumentProxy | null) => void;
}

export const usePdfStore = create<PdfStore>((set) => ({
  pdfDoc: null,
  setPdfDoc: (pdfDoc) => set({ pdfDoc }),
}));
