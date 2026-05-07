# Phase 1 — Critical Fixes + Lifecycle Stability

**Depends on:** Nothing — run first  
**Unlocks:** Phase 2 and Phase 3 (can start in parallel after this)  
**Estimated effort:** ~2 hours

---

## WI-1.0 — Baseline Audit Snapshot

**Create:** `AUDIT_BASELINE.md` in repo root

```markdown
# AUDIT_BASELINE — DocCraft

_Captured before Phase 1 changes. Update columns only — never delete rows._

## Static Counts

| Check | Command | Before | After Phase 1 | Target |
|-------|---------|--------|--------------|--------|
| createRoot calls | `grep -rn "createRoot" frontend/src \| wc -l` | ? | ? | 1 |
| as any in toolbar | `grep -rn "as any" frontend/src/components/toolbar/ \| wc -l` | ? | ? | 0 |
| console.log in src | `grep -rn "console\.log" frontend/src/ \| wc -l` | ? | ? | 0 |
| .orig/.rej files | `Get-ChildItem -Recurse -Include *.orig,*.rej \| Measure-Object` | ? | ? | 0 |
| conflict markers | `grep -rn "<<<<<<<" frontend/src \| wc -l` | ? | ? | 0 |
| localStorage refs | `grep -rn "localStorage" frontend/src/ \| wc -l` | ? | ? | ≤1 (theme only) |
| macro registered ops | console.log(macroRegistry.getRegisteredOps().length) at startup | ? | ? | 22 |
| annotation types covered in Konva | count non-default cases in KonvaAdapter switch | ? | ? | 17 |

## Build Health

| Step | Result |
|------|--------|
| npm install | PASS / FAIL |
| npm run typecheck | PASS / FAIL |
| npm test | PASS / FAIL |
| npm run build | PASS / FAIL |

## Browser Smoke (Manual)

| Scenario | Result |
|----------|--------|
| App loads at /Pdf-Hub/ | PASS / FAIL |
| Open PDF renders page 1 | PASS / FAIL |
| Search text, scroll after | PASS / FAIL |
| Create highlight annotation | PASS / FAIL |
| Run rotate_pages macro from sidebar | PASS / FAIL |
```

**Pass gate:** File exists, all rows populated.

---

## WI-1.1 — Fix `searchDocumentText` Destroying Cached Document

**File:** `frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts`

Find `searchDocumentText` and locate the `finally` block that calls `doc.destroy()`. Apply this fix:

```typescript
// BEFORE (around line 278):
    return hits;
  } finally {
    await doc.destroy();           // ❌ BUG — destroys shared cached document
  }
}

// AFTER:
    return hits;
  } finally {
    // NOTE: doc is borrowed from loadDocument(). Only closeDocument() may destroy it.
    // Per-page resources are cleaned up above inside the page loop.
  }
}
```

Also add per-page cleanup inside the search page loop (find the `for` loop over pages):

```typescript
// Inside the page loop — add cleanup after extracting text:
for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber);
  try {
    const textContent = await page.getTextContent();
    // ... existing search logic ...
  } finally {
    page.cleanup();   // ✅ clean up page resources, NOT the document
  }
}
```

**Pass gate:**
1. Open PDF → Search for any word → Scroll to a different page
2. Page renders correctly after search (no white canvas, no console errors)
3. `grep -n "doc.destroy" frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts` → appears only in `closeDocument` method

---

## WI-1.2 — Delete All Merge-Conflict Artifacts

**Step 1 — Delete .orig and .rej files:**
```powershell
Get-ChildItem -Path ".\frontend\src" -Recurse -Include "*.orig","*.rej" | Remove-Item -Force
```

**Step 2 — Scan for conflict markers:**
```powershell
Get-ChildItem -Path ".\frontend\src" -Recurse -Include "*.ts","*.tsx","*.css" |
  Select-String -Pattern "<<<<<<<|=======|>>>>>>>" |
  Select-Object Filename, LineNumber, Line
```

Manually resolve any files listed in Step 2 output.

**Step 3 — Verify clean:**
```powershell
# Both should return 0
(Get-ChildItem -Path ".\frontend\src" -Recurse -Include "*.orig","*.rej" | Measure-Object).Count
(Get-ChildItem -Path ".\frontend\src" -Recurse -Include "*.ts","*.tsx" | Select-String "<<<<<<<" | Measure-Object).Count
```

**Pass gate:** Both counts = 0.

---

## WI-1.3 — ErrorBoundary Component with Document-Aware Reset

**Create:** `frontend/src/components/ui/ErrorBoundary.tsx`

```tsx
import React from 'react';
import { error as logError } from '@/core/logger/service';

interface Props {
  zone: string;
  /** When this key changes (e.g. new document loaded), a crashed boundary auto-recovers. */
  resetKey?: string | number;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, errorMessage: err.message };
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-recover when a new document is loaded (resetKey changes)
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    logError('system', `Unhandled error in zone: ${this.props.zone}`, {
      error: err.message,
      stack: err.stack ?? '',
      componentStack: info.componentStack ?? '',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center h-full p-8 text-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="text-red-600 text-lg">!</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Something went wrong in {this.props.zone}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            {this.state.errorMessage}
          </p>
          <button
            className="mt-2 px-4 py-2 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Wire into AppShell** — find `AppShell.tsx` and wrap the three main zones:

```tsx
// frontend/src/components/shell/AppShell.tsx
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useSessionStore } from '@/core/session/store';

// Inside the component, get the current document hash for resetKey:
const fileHash = useSessionStore(s => s.fileHash ?? s.fileName ?? '');

// Wrap each panel:
<ErrorBoundary zone="Sidebar" resetKey={fileHash}>
  <SidebarPanel />
</ErrorBoundary>

<ErrorBoundary zone="Document Workspace" resetKey={fileHash}>
  <DocumentWorkspace />
</ErrorBoundary>

<ErrorBoundary zone="Inspector" resetKey={fileHash}>
  <InspectorPanel />
</ErrorBoundary>
```

**Pass gate:**
1. Temporarily throw `throw new Error('test crash')` inside `DocumentWorkspace` render
2. Only the workspace zone shows the red fallback — sidebar and inspector remain functional
3. Open a different PDF → workspace zone auto-recovers (no manual "Try Again" needed)
4. Remove the test throw

---

## WI-1.4 — Isolate `pagehide` Listener (Stop Re-registration on Every Annotation Change)

**File:** `frontend/src/components/workspace/DocumentWorkspace.tsx`

Find the annotation persistence `useEffect` (around line 179–196). It currently registers and re-registers the `pagehide` handler on every annotation change. Split it into two effects:

```typescript
// BEFORE (single effect doing both):
useEffect(() => {
  const timer = setTimeout(() => saveAnnotations(annotations), 400);
  const onPageHide = () => saveAnnotations(annotations);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('pagehide', onPageHide);
  };
}, [annotations]);

// AFTER (two separate effects):

// Effect 1 — debounced save on annotation changes
useEffect(() => {
  if (!fileHash) return;
  const timer = setTimeout(() => {
    saveAnnotationsToIndexedDB(fileHash, annotations);
  }, 400);
  return () => clearTimeout(timer);
}, [annotations, fileHash]);

// Effect 2 — pagehide listener registered ONCE per document load
useEffect(() => {
  if (!fileHash) return;
  const onPageHide = () => {
    saveAnnotationsToIndexedDB(fileHash, annotations);
  };
  window.addEventListener('pagehide', onPageHide);
  return () => window.removeEventListener('pagehide', onPageHide);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [fileHash]); // intentionally excludes annotations — captures on unload
```

**Pass gate:**
1. Create 10 annotations rapidly in 2 seconds
2. Browser DevTools → Event Listeners on `window` → `pagehide` shows exactly 1 listener
3. Wait 400ms of silence → Refresh page → Annotations persist (IndexedDB save fired)

---

## Phase 1 Completion Checklist

```
□ AUDIT_BASELINE.md created and all rows populated
□ doc.destroy() removed from searchDocumentText finally block
□ page.cleanup() added inside search page loop
□ Search → scroll test passes (page renders after search)
□ All .orig/.rej files deleted (count = 0)
□ Conflict marker scan returns 0 results
□ ErrorBoundary.tsx created with resetKey support
□ ErrorBoundary wraps DocumentWorkspace, SidebarPanel, InspectorPanel in AppShell
□ Zone crash test passes (only affected zone shows fallback)
□ Document reload test passes (boundary auto-recovers on new file)
□ pagehide listener split into separate one-time useEffect
□ Only 1 pagehide listener registered in DevTools after rapid annotation changes
```
