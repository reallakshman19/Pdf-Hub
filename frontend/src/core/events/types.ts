
export type DocumentEvent =
  | { type: 'PAGES_REORDERED'; order: number[] }
  | { type: 'PAGES_DELETED'; indices: number[] }
  | { type: 'PAGES_INSERTED'; atIndex: number; count: number }
  | { type: 'DOCUMENT_REPLACED' }
  | { type: 'PAGES_ROTATED'; rotations: Array<{ pageIndex: number; angle: number; width: number; height: number }> }
