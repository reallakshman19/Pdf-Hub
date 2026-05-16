# Phase 3 — Macro Engine + Transactions

**Depends on:** Phase 1 complete  
**Can run in parallel with:** Phase 2  
**Estimated effort:** ~2.5 hours

---

## WI-3.1 — Register Macro Step Executors at App Startup (ROOT CAUSE FIX)

**File:** `frontend/src/main.tsx`

**Root cause:** `register-all.ts` for macros is imported only in the test file (`expert.test.ts`). At runtime the `macroRegistry` is empty, causing every sidebar macro execution to fail with `Unknown op "rotate_pages". Not registered in macroRegistry.`

```diff
// frontend/src/main.tsx
 import '@/core/annotations/register-all';
+import '@/core/macro/steps/register-all';   // ← registers all 22 macro step executors
 import { StrictMode } from 'react';
 import { createRoot } from 'react-dom/client';
```

**Also add startup diagnostic log** in `register-all.ts` (non-DEV-only, uses structured logger):

```typescript
// frontend/src/core/macro/steps/register-all.ts — add at end of file
import { info } from '@/core/logger/service';

// Log registered op count to logStore (visible in Debug tab)
info('macro', 'Macro registry initialised', {
  registeredOps: macroRegistry.getRegisteredOps().length,
  ops: macroRegistry.getRegisteredOps().sort().join(', '),
});
```

**Pass gate:**
1. Open PDF → Sidebar → Macros → Select "Rotate selected pages 90°" → Run Macro
2. Run logs show: `[step 1/1] rotate_pages: Rotated 1 page(s) by 90°`
3. Page is visually rotated in the document canvas
4. Previously: `Unknown op "rotate_pages". Not registered in macroRegistry.`

---

## WI-3.2 — Remove `adjust_image` Stub from `generation-ops.ts`

**Root cause:** `generation-ops.ts` registers a no-op stub for `adjust_image` that silently overwrites the real implementation from `content-ops.ts` (which is imported earlier in `register-all.ts`).

**File:** `frontend/src/core/macro/steps/generation-ops.ts`

**Delete lines 161–173:**

```diff
-type AdjustImageStep = Extract<MacroStep, { op: 'adjust_image' }>;
-async function executeAdjustImage(
-  // eslint-disable-next-line @typescript-eslint/no-unused-vars
-  _step: AdjustImageStep,
-  // eslint-disable-next-line @typescript-eslint/no-unused-vars
-  _ctx: MacroExecutionContext,
-  // eslint-disable-next-line @typescript-eslint/no-unused-vars
-  _state: MacroMutableState,
-): Promise<StepResult> {
-  // Stub for Agent E
-  return { status: 'success', message: 'Adjust image stub', sideEffects: [] };
-}
-macroRegistry.register('adjust_image', executeAdjustImage);
```

Remove the now-unused import `MacroMutableState` from this file if that was its only use.

**Pass gate:**
```bash
grep -n "adjust_image" frontend/src/core/macro/steps/generation-ops.ts  # → 0 results
grep -n "adjust_image" frontend/src/core/macro/steps/content-ops.ts     # → 1 result (the real one)
```

---

## WI-3.3 — Make Macro Registry Duplicate-Safe

**File:** `frontend/src/core/macro/registry.ts`

Modify `MacroStepRegistry.register()` to throw on duplicate registration unless explicitly overridden. This catches future stub collisions at module load time.

```typescript
// frontend/src/core/macro/registry.ts — replace the register method

register<T extends MacroStep>(
  op: T['op'],
  executor: StepExecutor<T>,
  options?: { override?: boolean },
): void {
  if (this.executors.has(op) && !options?.override) {
    // Throw synchronously at module load — surfaces collision immediately
    throw new Error(
      `[MacroRegistry] Duplicate registration for op "${op}". ` +
      `Pass { override: true } if intentional. ` +
      `Check register-all.ts import order.`,
    );
  }
  this.executors.set(op, executor);
}
```

**Pass gate:**
1. Temporarily add a second `macroRegistry.register('rotate_pages', ...)` anywhere
2. App startup throws with the message above
3. Remove the duplicate
4. App starts without error

---

## WI-3.4 — Wrap Macro Execution in Atomic Transaction with Rollback

**File:** `frontend/src/core/macro/executor.ts`

The current executor applies side effects step-by-step but has no rollback on partial failure. A 3-step macro where step 2 throws leaves the document in an unknown state.

**Replace the execution loop section** (the `for` loop at line 59):

```typescript
// frontend/src/core/macro/executor.ts
// Add before the execution loop:
const beforeBytes = state.workingBytes;

const stepResults: StepResult[] = [];
let executionFailed = false;

try {
  // 4. Execute via registry — no step logic here
  for (let i = 0; i < expandedRecipe.steps.length; i++) {
    const step = expandedRecipe.steps[i];
    onProgress?.({ current: i + 1, total: expandedRecipe.steps.length, currentOp: step.op });

    let result: StepResult;
    try {
      result = await macroRegistry.execute(step, ctx, state);
    } catch (err) {
      // Registry execution threw (e.g. unregistered op, adapter crash)
      result = {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        sideEffects: [],
      };
    }

    stepResults.push(result);

    for (const effect of result.sideEffects) {
      if (effect.type === 'bytes_updated')      state.workingBytes = effect.bytes;
      if (effect.type === 'page_count_changed') state.pageCount = effect.newCount;
      if (effect.type === 'output_file')        state.outputFiles.push({ name: effect.name, bytes: effect.bytes });
    }

    if (result.message) {
      state.logs.push(`[step ${i+1}/${expandedRecipe.steps.length}] ${step.op}: ${result.message}`);
    }

    if (result.status === 'error') {
      executionFailed = true;
      if (ctx.options?.abortOnError !== false) break;
    }
  }
} catch (unexpectedErr) {
  // Catastrophic failure — rollback to pre-execution bytes
  executionFailed = true;
  state.workingBytes = beforeBytes;
  state.logs.push(`[fatal] Unexpected error — document rolled back to pre-macro state`);
  throw unexpectedErr;
}

// Rollback on any error by default (configurable)
if (executionFailed && ctx.options?.rollbackOnError !== false) {
  state.workingBytes = beforeBytes;
  state.logs.push('[rollback] Macro failed — document restored to pre-run state');
}

return {
  success: !executionFailed,
  outputFiles: state.outputFiles,
  stepResults,
  finalBytes: state.workingBytes,
  logs: state.logs,
  selectedPages: state.selectedPages,
};
```

**Also add `rollbackOnError` to `MacroExecutionContext` options** in `types.ts`:

```typescript
// frontend/src/core/macro/types.ts — extend options
options?: {
  abortOnError?: boolean;
  rollbackOnError?: boolean;   // ← add this, default true
};
```

**Pass gate:**
1. Temporarily make step 2 of a 3-step macro throw
2. Final PDF bytes must be byte-identical to the pre-run document
3. Logs must include `[rollback] Macro failed — document restored to pre-run state`
4. Remove the test throw

---

## WI-3.5 — Fix Second `createRoot` in `pageRenderer.ts` (INV-1)

**File:** `frontend/src/core/macro/layout/pageRenderer.ts`

Replace the offscreen `createRoot` pattern with `renderToStaticMarkup` from `react-dom/server`. This eliminates the second `createRoot` call and keeps the page generation pipeline purely synchronous on the React side.

```typescript
// frontend/src/core/macro/layout/pageRenderer.ts

// REMOVE this import:
// import { createRoot } from 'react-dom/client';

// ADD this import:
import { renderToStaticMarkup } from 'react-dom/server';

// REPLACE the offscreen render section — find where createRoot is used:

// BEFORE:
const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
await new Promise<void>(resolve => {
  root.render(<PageLayout ... onReady={resolve} />);
});
root.unmount();
document.body.removeChild(container);

// AFTER — synchronous, no second root:
const container = document.createElement('div');
Object.assign(container.style, {
  position: 'absolute',
  left: '-9999px',
  top: '-9999px',
  width: `${pageWidthPx}px`,
  minHeight: `${pageHeightPx}px`,
});
container.innerHTML = renderToStaticMarkup(<PageLayout {...props} />);
document.body.appendChild(container);

try {
  // html2canvas capture (unchanged)
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(container, {
    width: pageWidthPx,
    height: pageHeightPx,
    scale: 2,
    backgroundColor: backgroundColor ?? '#ffffff',
    useCORS: true,
    logging: false,
  });

  return await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('html2canvas returned no blob')); return; }
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/png');
  });
} finally {
  document.body.removeChild(container);
}
```

**Pass gate:**
```bash
grep -rn "createRoot" frontend/src | wc -l   # → must equal 1 (only main.tsx)
```

---

## WI-3.6 — Add Macro Execution Queue (Prevent Double-Submit Corruption)

**File:** `frontend/src/core/macro/sessionRunner.ts`

Add a module-level run lock to prevent concurrent macro executions:

```typescript
// frontend/src/core/macro/sessionRunner.ts

// Add at module scope:
let runPromise: Promise<unknown> = Promise.resolve();

export async function runMacroRecipeAgainstSession(
  recipe: MacroRecipe,
  options?: { donorFiles?: Record<string, Uint8Array>; saveOutputs?: boolean; dryRun?: boolean },
) {
  // Queue this run after the previous one completes — prevents double-submit
  const run = runPromise.then(() => _executeRecipe(recipe, options));
  runPromise = run.catch(() => undefined); // don't let errors block the queue
  return run;
}

// Rename the existing function body to _executeRecipe (private):
async function _executeRecipe(
  recipe: MacroRecipe,
  options?: { donorFiles?: Record<string, Uint8Array>; saveOutputs?: boolean; dryRun?: boolean },
) {
  // ... existing body unchanged ...
}
```

**Pass gate:**
1. Click "Run Macro" twice rapidly
2. Network tab shows a single PDF mutation (not two)
3. Document is in a consistent state after both clicks resolve

---

## Phase 3 Completion Checklist

```
□ main.tsx imports '@/core/macro/steps/register-all'
□ register-all.ts logs registered op count to logStore (not console)
□ Sidebar rotate_pages macro executes and rotates page
□ Generation macro "Full Report (3 pages)" appends 3 pages to document
□ adjust_image stub removed from generation-ops.ts
□ MacroStepRegistry.register() throws on duplicate registration
□ Atomic rollback: failed multi-step macro leaves doc byte-identical to pre-run
□ MacroExecutionContext options includes rollbackOnError
□ pageRenderer.ts uses renderToStaticMarkup — no createRoot call
□ grep createRoot frontend/src | wc -l → 1
□ Double-click Run Macro produces single execution
```
