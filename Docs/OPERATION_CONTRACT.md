# Operation Contract

This document defines the contract that governs all actions performed by DocCraft.  By formalising the command interface we ensure that every modification to a PDF is auditable, undoable (where technically possible) and safe.  The contract also distinguishes between preview and final execution for destructive operations.

## Command Structure

Each command is represented by a TypeScript interface extending `PdfCommandBase` and contains:

* `id` – a unique identifier for the command instance.
* `type` – a string literal indicating the specific command (e.g. `ANNOTATION_ADD`).
* `source` – where the command originated: `'user'`, `'macro'`, `'ai'` or `'system'`.
* `risk` – one of `'safe'`, `'destructive-preview-required'`, `'destructive-confirm-required'` or `'server-only'`.
* `createdAt` – ISO timestamp when the command was created.
* `documentKey` – the key identifying the document being operated on.
* `payload` – command‑specific data.  For example, an `ANNOTATION_ADD` payload contains the annotation type, page number and rectangle.

Commands return a `PdfCommandResult` containing:

* `ok` – whether the command succeeded.
* `dirty` – whether the document is now unsaved.
* `message` – optional human‑readable information.
* `inverseCommand` – a command that reverses this one (for undo).

## Lifecycle

1. **Creation:** A UI event or API call constructs a command and assigns a unique ID and timestamp.
2. **Validation:** The command is passed to a validator which checks types, ranges and permissions.  Invalid commands are rejected before execution.
3. **Preview:** For destructive commands (`risk` = `'destructive-preview-required'`), the system produces a `PdfCommandPreview` summarising the effects (e.g. pages that will be deleted) and prompts the user for confirmation.
4. **Confirmation:** The user (or macro/AI depending on source) must confirm before final execution.  Commands with `risk` = `'destructive-confirm-required'` always require explicit confirmation, even if no preview is shown.
5. **Execution:** A registered handler applies the command to the document.  The handler must return a `PdfCommandResult` with an inverse command for undo.
6. **History:** The command and its inverse are recorded in the history stack, making undo/redo possible.  If execution failed, the history is not mutated.
7. **Persist:** If the document is in server mode, changes are persisted via API calls.  In preview mode, changes remain client‑side until the user saves.

## Risk Levels

The `risk` field signals how the UI should handle the command:

| Risk                              | UI Handling                                                             |
|-----------------------------------|-------------------------------------------------------------------------|
| `safe`                            | Execute immediately; user can undo.                                    |
| `destructive-preview-required`    | Display preview with diff; require confirmation before execution.       |
| `destructive-confirm-required`    | Require confirmation; preview is optional.                              |
| `server-only`                     | Command cannot run client‑side; must be dispatched to the back‑end.     |

Examples: adding an annotation is `safe`; deleting pages is `destructive-preview-required`; applying a redaction is `destructive-confirm-required`; merging large files may be `server-only`.

## Invariants

* All commands must be serialisable into JSON.  This allows them to be persisted, replayed and transmitted to the server.
* Undo must never be destructive.  If a command cannot be undone (e.g. due to loss of original content), it must be marked as non‑undoable and the UI should warn the user.
* The validator must not mutate the document; it only inspects the payload.
* Command handlers must be pure relative to external state: given the same document and payload they should produce the same result.

## Extensibility

New commands should extend the `PdfCommandBase` interface and be added to the `PdfCommand` union type in `frontend/src/core/commands/types.ts`.  A corresponding handler should be registered in `frontend/src/core/commands/registry.ts`.

## Conclusion

By adhering to this contract, the DocCraft workbench ensures that user actions are predictable, traceable and reversible.  This foundation enables advanced features such as macros, AI‑generated edits and collaborative workflows without compromising safety.
