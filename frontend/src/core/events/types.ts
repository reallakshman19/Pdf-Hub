
export type DocumentEvent =
  | { type: 'PAGES_REORDERED'; order: number[] }
  | { type: 'PAGES_DELETED'; indices: number[] }
  | { type: 'PAGES_INSERTED'; atIndex: number; count: number }
  | { type: 'DOCUMENT_REPLACED' }
