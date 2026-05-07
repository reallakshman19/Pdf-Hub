# Phase 5 — Resilience + Capability Guards

**Depends on:** Phase 4 complete  
**Estimated effort:** ~2 hours

---

## WI-5.1 — `useCapabilities` Hook (INV-5 Compliance)

**Create:** `frontend/src/hooks/useCapabilities.ts`

```typescript
import { useState, useEffect, useRef } from 'react';
import { info } from '@/core/logger/service';

export type AppMode = 'preview' | 'server';

export interface Capabilities {
  /** Current operating mode */
  mode: AppMode;
  /** Whether the local backend server responded to /api/health */
  serverAlive: boolean;
  /** Server-only: background OCR jobs */
  hasServerOcr: boolean;
  /** Server-only: macro console route */
  hasMacroConsole: boolean;
  /** Milliseconds the health check took, or null if not yet checked */
  latencyMs: number | null;
}

const PREVIEW_CAPS: Capabilities = {
  mode: 'preview',
  serverAlive: false,
  hasServerOcr: false,
  hasMacroConsole: false,
  latencyMs: null,
};

/**
 * Detects whether the local backend server is available.
 * Returns capability flags — components use these to show/hide features.
 *
 * Rule INV-5: Never use import.meta.env to gate features. Use this hook.
 */
export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(PREVIEW_CAPS);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    // Use VITE_API_BASE_URL so this works on GitHub Pages / custom subpaths
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
    const healthUrl = `${apiBase}/api/health`;

    const t0 = performance.now();

    fetch(healthUrl, { signal: controller.signal })
      .then(r => {
        const latencyMs = Math.round(performance.now() - t0);
        const alive = r.ok;
        const mode: AppMode = alive ? 'server' : 'preview';

        info('capabilities', 'Mode detection complete', {
          mode,
          serverAlive: alive,
          latencyMs,
        });

        setCaps({
          mode,
          serverAlive: alive,
          hasServerOcr: alive,
          hasMacroConsole: alive,
          latencyMs,
        });
      })
      .catch(() => {
        // Timeout or network error → preview mode (expected on GitHub Pages)
        const latencyMs = Math.round(performance.now() - t0);
        info('capabilities', 'Mode detection complete', {
          mode: 'preview',
          serverAlive: false,
          latencyMs,
        });
        setCaps({ ...PREVIEW_CAPS, latencyMs });
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  return caps;
}
```

**Pass gate:**
1. With no backend running: `useCapabilities().mode === 'preview'` within 3 seconds
2. No `AbortError` console errors in DevTools
3. Logger Debug tab shows `Mode detection complete` log entry with mode and latencyMs

---

## WI-5.2 — PreviewModeBanner (INV-9 Compliance)

**Create:** `frontend/src/components/shell/PreviewModeBanner.tsx`

```tsx
import React from 'react';

/**
 * Non-dismissible banner shown when the app runs without a local server.
 *
 * Rule INV-9: This banner MUST be visible in preview mode.
 * It MUST NOT have a close/dismiss button.
 * It MUST be at the top of the workspace.
 */
export const PreviewModeBanner: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="w-full bg-amber-400 dark:bg-amber-500 text-amber-950 text-xs font-semibold text-center py-1.5 px-4 select-none shrink-0"
  >
    Running in preview mode — Start the local server for full features.
  </div>
);
```

**Wire into `AppShell.tsx`:**

```tsx
// frontend/src/components/shell/AppShell.tsx
import { useCapabilities } from '@/hooks/useCapabilities';
import { PreviewModeBanner } from '@/components/shell/PreviewModeBanner';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const capabilities = useCapabilities();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* INV-9: Banner visible in preview mode, non-dismissible */}
      {capabilities.mode === 'preview' && <PreviewModeBanner />}

      {/* Existing layout zones */}
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        {/* ... sidebar, workspace, inspector ... */}
      </div>
    </div>
  );
};
```

**Pass gate:**
1. No backend running → Banner visible at top of page
2. Banner has no ×/close button (inspect DOM)
3. Backend running → Banner not present in DOM (not just hidden — not rendered)

---

## WI-5.3 — Server-Only Feature Guard Component

**Create:** `frontend/src/components/ui/FeatureUnavailable.tsx`

```tsx
import React from 'react';

interface Props {
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shown in place of server-only features when running in preview mode.
 * Rule INV-5: Features not available in current mode are HIDDEN, not broken.
 */
export const FeatureUnavailable: React.FC<Props> = ({ reason, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
      <span className="text-slate-400 text-sm">—</span>
    </div>
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-48 leading-relaxed">
      {reason}
    </p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="text-xs text-blue-600 hover:underline"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
```

**Usage pattern** for any server-only UI section:

```tsx
// Example: OCR panel
import { useCapabilities } from '@/hooks/useCapabilities';
import { FeatureUnavailable } from '@/components/ui/FeatureUnavailable';

const OcrPanel: React.FC = () => {
  const { hasServerOcr } = useCapabilities();

  if (!hasServerOcr) {
    return (
      <FeatureUnavailable
        reason="Server OCR requires the local backend. Start the server to enable."
      />
    );
  }

  // ... actual OCR UI ...
};
```

**Pass gate:** In preview mode, no `fetch('/api/...')` call is made from hidden feature panels.

---

## WI-5.4 — Remove DebugPage Inner Guard

**File:** `frontend/src/pages/DebugPage.tsx`

The route is already guarded in `App.tsx` via `isDebugRouteEnabled`. The second guard using `window.location.replace('/')` causes a full page reload and flash.

```diff
// frontend/src/pages/DebugPage.tsx — near top of component:
-  if (!import.meta.env.DEV) {
-    window.location.replace('/');
-    return null;
-  }

// Keep only:
// The route in App.tsx already prevents non-dev access.
// No inner guard needed.
```

**Pass gate:** In dev mode, `/debug` loads without flash. In prod build (if tested), the route is simply absent from `App.tsx` — `DebugPage` is never mounted.

---

## WI-5.5 — Singleton Tesseract Worker + OCR Promise Queue (INV-6)

**File:** `frontend/src/core/ocr/clientOcr.ts`

**Replace the entire file:**

```typescript
/**
 * clientOcr.ts
 *
 * Singleton Tesseract.js worker with sequential job queue.
 *
 * Rule INV-6: OCR is always async, never blocks the main thread.
 * - Worker is created once, reused across all calls.
 * - Concurrent calls are serialized via promise chain (no race conditions).
 * - Worker is terminated only on explicit shutdown or page unload.
 */

type TesseractWorker = Awaited<
  ReturnType<typeof import('tesseract.js')['createWorker']>
>;

let workerInstance: TesseractWorker | null = null;
let workerInitPromise: Promise<TesseractWorker> | null = null;

// Promise chain — ensures OCR jobs run one at a time
let jobQueue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<TesseractWorker> {
  if (workerInstance) return workerInstance;

  // Coalesce concurrent getWorker() calls into a single init
  if (!workerInitPromise) {
    workerInitPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('eng'))
      .then(worker => {
        workerInstance = worker;
        return worker;
      })
      .catch(err => {
        // Reset so next call retries
        workerInitPromise = null;
        throw err;
      });
  }

  return workerInitPromise;
}

/**
 * Recognizes text in a base64 image data URL.
 * Calls are automatically serialized — safe to call concurrently.
 */
export async function recognizeImage(base64DataUrl: string): Promise<string> {
  const result = jobQueue.then(async () => {
    const worker = await getWorker();
    const ret = await worker.recognize(base64DataUrl);
    return ret.data.text;
  });

  // Extend the queue — errors in one job don't block subsequent jobs
  jobQueue = result.catch(() => undefined);

  return result;
}

/**
 * Terminates the worker and clears the singleton.
 * Call on page unload or when OCR is no longer needed.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerInitPromise = null;
  }
}

// Auto-terminate on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void terminateOcrWorker();
  }, { once: true });
}
```

**Pass gate:**
1. Call `recognizeImage(...)` on 5 different images concurrently
2. All 5 return correct text (no worker busy error)
3. Second call to `recognizeImage` completes in < 500ms (worker already initialized)
4. DevTools Performance tab shows a single Tesseract worker thread, not 5

---

## Phase 5 Completion Checklist

```
□ useCapabilities.ts created with AbortController and VITE_API_BASE_URL support
□ useCapabilities logs 'Mode detection complete' to logStore
□ PreviewModeBanner.tsx created — no close button
□ PreviewModeBanner shown when mode='preview', absent when mode='server'
□ FeatureUnavailable.tsx created
□ At least one server-only panel uses FeatureUnavailable guard
□ DebugPage inner window.location.replace guard removed
□ clientOcr.ts replaced with singleton + promise-queue implementation
□ 5 concurrent OCR calls all complete successfully
□ Worker initialization happens once (verified via DevTools thread count)
□ terminateOcrWorker called on pagehide
□ npm run check:all still passes after Phase 5 changes
```
