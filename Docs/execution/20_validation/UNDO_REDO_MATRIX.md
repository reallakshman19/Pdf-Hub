# Undo/Redo Matrix

This matrix details the expected behavior of document mutations regarding the undo/redo stack managed by A1. All actions listed below **must** be fully reversible.

## Page Operations
| Action | Description | Must be Reversible | Notes |
| :--- | :--- | :---: | :--- |
| Rotate Page | Rotating a single page or selection of pages (90, 180, 270 degrees). | Yes | Handled via command bus. |
| Extract Page | Creating a new document from a page selection. | Yes (in source doc) | The extraction itself does not mutate the source, but if tied to a 'cut' action, it must be reversible. |
| Delete Page | Removing pages from the document. | Yes | Requires full state restoration of the deleted page content. |
| Replace Page | Swapping a page with another file/page. | Yes | Needs transaction storing both the removed page and the new page state. |
| Reorder Pages | Moving pages within the document via drag-and-drop or command. | Yes | |

## Annotation Operations
| Action | Description | Must be Reversible | Notes |
| :--- | :--- | :---: | :--- |
| Add Annotation | Adding a highlight, underline, note, or callout. | Yes | |
| Modify Annotation | Changing the text, color, or position of an existing annotation. | Yes | |
| Delete Annotation | Removing an annotation. | Yes | |
| Review Status Change | Approving, rejecting, or resolving an annotation thread. | Yes | Required for A7 integration. |

## Execution Constraints
- All defined mutations must route through the A1 Command Dispatcher.
- Direct mutation of the document state outside of a recognized command transaction is explicitly forbidden.

## Automated Verification Snapshot (2026-04-22)
- Command dispatch tests: pass
- History store tests (`push`, `undo`, `redo`, `peekUndo`, `peekRedo`): pass
- Keyboard undo/redo route through document history first: pass
- Session replacement only from dispatcher/history transaction layer: pass
