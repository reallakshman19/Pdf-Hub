/*
 * Selection types for DocCraft.
 *
 * The selection system is independent of page selection.  It tracks
 * which object type and identifiers are currently selected in the
 * editor.  This allows the inspector and other components to react to
 * user focus changes.
 */

export type SelectionKind =
  | 'none'
  | 'page'
  | 'annotation'
  | 'writerOverlay'
  | 'ocrBlock'
  | 'bookmark'
  | 'redactionPreview';

export interface SelectionState {
  /**
   * The kind of object currently selected.
   */
  kind: SelectionKind;
  /**
   * The identifiers of the selected objects.  For page selections this
   * may contain multiple page IDs; for other kinds it is typically a
   * single ID.
   */
  ids: string[];
  /**
   * Optional page number associated with the selection.  Useful when the
   * selection refers to objects on a specific page.
   */
  pageNumber?: number;
}