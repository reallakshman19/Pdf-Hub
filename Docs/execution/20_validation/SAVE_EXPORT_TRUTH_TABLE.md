# Save/Export Truth Table

This document explicitly defines the semantics for save, export, and download actions. A1 handles the underlying state and A0 enforces the correct application of these definitions across all agents.

## Definitions

- **Working Document:** The active state in memory including all unsaved mutations (annotations, page operations).
- **Unsaved Changes Flag:** A boolean indicating if the working document differs from the last saved state.

## Truth Table

| Action | Input State | Resulting File Action | Unsaved Changes Flag After | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Save** | Unsaved Changes = True | Overwrites the original file with the current working state. | False | If it is a new file (never saved), prompts for a location. |
| **Save** | Unsaved Changes = False | No-op, or overwrites with identical state. | False | |
| **Save As** | Any | Prompts for new location, saves current working state to new file. | False | The "active" document switches to the newly saved file. |
| **Export Flattened** | Any | Generates a new PDF where all annotations are burned into the page stream. | Unchanged | Does NOT change the working document or the unsaved flag. |
| **Download** | Any | Triggers a browser download of the current working state. | Unchanged | Depending on integration, this may act like a localized "Save As" without changing the active working path. |

## Important Considerations
- Exporting a flattened copy must **never** mutate the active working document's editability.
- If an automated macro executes a save operation, it follows the "Save" row logic unless explicitly configured to "Save As".

## Automated Validation Snapshot (2026-04-22)
- Session operation metadata (`lastOperation`, status, action type) is written for save/export/download flows.
- Toolbar save/export paths pass typecheck, lint, tests, and build.
- Command-layer mutation rules keep save/export semantics separate from document mutation undo stack.
