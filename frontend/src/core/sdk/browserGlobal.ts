import { createPdfHubSdk } from './publicSdk';
import type { PdfHubSdk } from './types';

export const pdfHubSdk = createPdfHubSdk();

declare global {
  interface Window {
    PDFHubSDK?: PdfHubSdk;
  }
}

if (typeof window !== 'undefined') {
  window.PDFHubSDK = pdfHubSdk;
}
