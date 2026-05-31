# Known Issues

Captured from `pnpm lint` run on 2026-05-17 (updated after patch4 applied on 2026-05-17). TypeScript (`pnpm typecheck`) is clean — zero errors.

---

## ESLint Errors (5 errors, 5 warnings)

### Errors

#### 1. `SelectBoxCopyResultPanel.tsx:48` — `setState` inside `useEffect` body
- **File**: `frontend/src/components/select-box-copy/SelectBoxCopyResultPanel.tsx`
- **Rule**: `react-hooks/set-state-in-effect`
- **Detail**: `setTableDraft(...)` and `setInsertMode(...)` are called synchronously inside a `useEffect`. This causes cascading renders.
- **Fix**: Derive state from `result` directly via `useMemo` instead of syncing it in an effect.

#### 2. `ColorPickerPopover.tsx:25` — `setState` inside `useEffect` body
- **File**: `frontend/src/components/ui/ColorPickerPopover.tsx`
- **Rule**: `react-hooks/set-state-in-effect`
- **Detail**: `setHex(value)` is called directly inside `useEffect(() => { setHex(value); }, [value])`. The `hex` state can be replaced with a controlled prop or derived via `useMemo`.
- **Fix**: Remove the effect and use `value` as a controlled prop, or use `useReducer`.

#### 3. `DocumentWorkspace.tsx:183` — `setState` inside `useEffect` body
- **File**: `frontend/src/components/workspace/DocumentWorkspace.tsx`
- **Rule**: `react-hooks/set-state-in-effect`
- **Detail**: `setRestoredCount(0)` is called synchronously at the top of an async `useEffect` that also loads annotations from IndexedDB. The synchronous reset fires immediately, which triggers a re-render before the async load completes.
- **Fix**: Move `setRestoredCount(0)` inside the async `loadStored` function so it runs in the same microtask as `setAnnotations`.

#### 4. `WriterElementBox.tsx:46` — `setState` inside `useEffect` body
- **File**: `frontend/src/components/writer-v2/WriterElementBox.tsx`
- **Rule**: `react-hooks/set-state-in-effect`
- **Detail**: `setDraftRect(null)` is called synchronously inside a `useEffect` that watches `element.rect` coordinates.
- **Fix**: Use `useLayoutEffect` (acceptable for synchronous DOM-measurements) or derive draft state differently.

#### 5. `WriterRichElementBox.tsx:63` — Unknown ESLint rule `react/no-danger`
- **File**: `frontend/src/components/writer-v2/WriterRichElementBox.tsx`
- **Rule**: `react/no-danger` (not installed)
- **Detail**: The ESLint config references the `react/no-danger` rule but the `eslint-plugin-react` package either isn't installed or doesn't export this rule in the current version.
- **Fix**: Install `eslint-plugin-react` and ensure it's registered in `eslint.config.js`, or remove the rule if it is no longer needed.

---

### Warnings

#### 6. `InspectorPanel.tsx:747` — Non-component export in component file
- **File**: `frontend/src/components/inspector/InspectorPanel.tsx`
- **Rule**: `react-refresh/only-export-components`
- **Detail**: The file exports a non-component value alongside React components, which breaks React Fast Refresh hot reloading.
- **Fix**: Move the non-component export to a separate utility file.

#### 7. `MacroNestedBranchEditor.tsx:236` — Non-component export in component file
- **File**: `frontend/src/components/macro/builder/MacroNestedBranchEditor.tsx`
- **Rule**: `react-refresh/only-export-components`
- **Fix**: Same as above — extract the non-component export to its own file.

#### 8. `Tabs.tsx:9` — React context exported from component file
- **File**: `frontend/src/components/ui/Tabs.tsx`
- **Rule**: `react-refresh/only-export-components`
- **Fix**: Move the React context to a separate `TabsContext.ts` file.

#### 9. `WriterOverlayLayer.tsx:145` — Non-component export in component file
- **File**: `frontend/src/components/writer-v2/WriterOverlayLayer.tsx`
- **Rule**: `react-refresh/only-export-components`
- **Fix**: Same pattern — extract the non-component to its own module.

#### 10. `WriterPopupEditor.tsx:79` — Missing `useMemo` dependencies
- **File**: `frontend/src/components/writer-v2/WriterPopupEditor.tsx`
- **Rule**: `react-hooks/exhaustive-deps`
- **Detail**: `React.useMemo` is missing `element.editorStateJson` and `element.plainText` from its dependency array.
- **Fix**: Add the missing dependencies, or if the stale-closure is intentional, suppress with a comment explaining why.

---

---

## Patch-Skipped Files (agent_07A_to_08B)

The following files from patch4 were **not applied** because they conflict with the existing, richer macro system in `frontend/src/core/macro/` (which uses Zustand, a complex type hierarchy, and sub-directories for recipes and store presets):

- `core/macro/types.ts` — patch defines a simple `Macro` interface; existing file has 200+ lines of `MacroStep`, `MacroRecipe`, `MacroCondition`, etc.
- `core/macro/store.ts` — patch is a new file, but `core/macro/store/` is already a directory with Zustand-based store
- `core/macro/recipes.ts` — patch is a new file, but `core/macro/recipes/` is already a directory with persistent recipe storage
- `components/generate/MacroBuilder.tsx` — imports from the skipped patch macro store; would not compile against existing macro types
- `pages/MacroConsolePage.tsx` — depends on the skipped patch `MacroStore` class

---

## Not Errors — Expected Limitations

These are architectural deferrals documented in `docs/REMAINING_BACKEND_DEFERRED_REGISTER.md`:

- Redaction is preview-only (no server-side PDF rewrite)
- OCR runs via Tesseract.js in-browser only (no server job queue)
- Annotations persist to IndexedDB only (no cross-device sync)
- Large PDF operations may exhaust browser memory (no server-side range service)
