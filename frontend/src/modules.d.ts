declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
    [key: string]: any;
  }
  export interface PDFPageProxy {
    getViewport(params: { scale: number; rotation?: number }): {
      width: number;
      height: number;
      scale: number;
      transform: number[];
      [key: string]: any;
    };
    render(params: any): { promise: Promise<void> };
    cleanup(): void;
    [key: string]: any;
  }
  export function getDocument(src: any): { promise: Promise<PDFDocumentProxy> };
  export const version: string;
}
