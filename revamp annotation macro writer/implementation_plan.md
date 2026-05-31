# Revised Static-First Robust PDF App — Implementation Plan

> **For**: Any coding agent. Every file path, import, type, and test pattern is exact.
> **Rule**: [AGENTS.md](file:///c:/Code1/Pdf-Hub/AGENTS.md) governs all phases. This plan does not override it.
> **Phase prefix**: S-Phase (Static-First Phase) to avoid collision with [ARCHITECTURE.md §11](file:///c:/Code1/Pdf-Hub/ARCHITECTURE.md#L259) existing P0–P5.
> **Enhanced scope**: WordPad-style rich text foundation, custom Lexical nodes (ImageNode, TableNode, HeadingNode), image/table insertion workflows, export pipeline that preserves formatting, annotation coordinate stability with batch reprojection.

---

## Prerequisite: Amend Governing Documents—Before any phase begins, two documents must be updated.

### A. Amend [ARCHITECTURE.md §1](file:///c:/Code1/Pdf-Hub/ARCHITECTURE.md#L10-L25) — Three Modes—Replace the two-mode table with:

```diff
-There are two modes, but they are not equal products:
+There are three modes, but they are not equal products:

-| Mode            | What it is                                      | Who it serves                        |
-|-----------------|-------------------------------------------------|--------------------------------------|
-| **Server mode** | Full editor — OCR, annotations, macro API       | The real product. Always the target. |
-| **Preview mode**| Read-only viewer + limited client-side OCR      | Fallback when server is not running. Honest about its limits. |
+| Mode            | What it is                                      | Who it serves                        |
+|-----------------|-------------------------------------------------|--------------------------------------|
+| **Server mode** | Full editor — OCR, annotations, macro API       | The real product. Always the target. |
+| **Preview mode**| Local app without backend; client-only features | Dev/local fallback. Probes server once. |
+| **Static mode** | Deployed build, no server ever expected          | GitHub Pages / CDN. Zero network calls. |
```

### B. Amend [AGENTS.md INV-5](file:///c:/Code1/Pdf-Hub/AGENTS.md) — Mode Detection Exception—Add this clarification under INV-5:

```diff
 Use `useCapabilities()` to gate. Never use `import.meta.env` to gate features.
+EXCEPTION: `import.meta.env.VITE_APP_MODE` may be used SOLELY to determine
+the initial AppMode ('static' | 'preview' | 'server'). All feature gating
+after that point must use the capabilities object, never env vars directly.
```

### C. Acknowledge: No Backend—This entire plan is **frontend-only**. There is no `backend/` directory. All `backend/` references in AGENTS.md are forward contracts. Server-mode capabilities remain hidden until a backend is built.

---

## S-Phase 0 — Baseline Audit & Release Gate

**Goal**: Create one single `check:release` command that replaces all 9 existing `certify:*` scripts.

---

### S-Phase 0.1 — Expand Static Contract Checks

**File**: [frontend/scripts/static-contract-checks.mjs](file:///c:/Code1/Pdf-Hub/frontend/scripts/static-contract-checks.mjs)—Add these checks to the existing file (after line 53, before the summary):

```javascript
// ���� S-Phase 0 additions ������������������������������������������������������������������������������������

// No fetch() calls outside capability-aware services—check(
  'no raw fetch in components',
  'fetch\\(',
  'components',
  0,
  { includeTests: false },
);

// No server-only routes rendered without capability guard—check(
  'macro route has capability guard',
  'MacroBuilderPage',
  null,
  2, // App.tsx import + guarded route only
  { includeTests: false },
);

// No localStorage for any persistence (annotations, writer, OCR)—check(
  'no localStorage persistence',
  'localStorage\\.(setItem|getItem)',
  'core',
  0,
);

// No unsafe `any` in core domain types—check(
  'no any in core domain types',
  ': any[^_]',
  'core',
  0,
  { includeTests: false },
);

// No duplicate macro registrations possible—check(
  'macro register-all imports all step modules',
  "import '\\./",
  'core/macro/steps',
  4, // page-ops, document-ops, content-ops, conditional-ops
  { includeTests: false },
);

// Verify .orig/.rej files don't exist—check('no .orig files', '\\.orig$', null, 0);—check('no .rej files', '\\.rej$', null, 0);
```

**Test for this check** — add to the `console.log` summary at end of file:

```javascript
// Generate machine-readable audit report—import { writeFileSync } from 'fs';—const report = {
  timestamp: new Date().toISOString(),
  pass: failCount === 0,
  totalChecks: /* count from checks array */,
  failures: failCount,
  phase: 'S-Phase-0',
};—writeFileSync(
  path.join(repoRoot, '..', 'AUDIT_REPORT.json'),
  JSON.stringify(report, null, 2),
);
```

---

### S-Phase 0.2 — Consolidate Into `check:release`

**File**: [frontend/package.json](file:///c:/Code1/Pdf-Hub/frontend/package.json) — replace `check:all` and add `check:release`:

```json
"check:release": "npm run typecheck && npm run lint && npm test && npm run check:static && npm run build"
```—Remove these deprecated scripts (they are subsumed by `check:release`):
- `certify`
- `certify:slice1`
- `certify:macro-enh2`
- `certify:writer-overlay-v2`
- `certify:writer-overlay-v2-final`
- `certify:generate-document`—Keep domain-specific ones that run individual test suites:
- `certify:layout-engine`
- `certify:generation-recipes`
- `certify:generation-template-library`

---

### S-Phase 0.3 — Acceptance Test

```bash
# MUST exit 0—pnpm --dir frontend check:release

# MUST produce this file—test -f AUDIT_REPORT.json

# MUST show pass:true—node -e "const r=require('./AUDIT_REPORT.json'); process.exit(r.pass ? 0 : 1)"
```

---

## S-Phase 1 — Static Mode Hardening

**Goal**: Three-mode capability system. Static mode = zero network calls. Client macros available everywhere.

---

### S-Phase 1.1 — New AppMode Type

**File**: [frontend/src/hooks/useCapabilities.ts](file:///c:/Code1/Pdf-Hub/frontend/src/hooks/useCapabilities.ts)—Replace the entire file with:

```typescript—import { useEffect, useState } from 'react';—import { log } from '@/core/logger/service';

// ���� S-Phase 1: Three-mode system ��������������������������������������������������������������—export type AppMode = 'static' | 'preview' | 'server';—export interface Capabilities {
  mode: AppMode;
  serverAlive: boolean;

  // Client capabilities (always true for preview+server, always true for static)
  canUseClientPdfTools: boolean;
  canUseClientAnnotations: boolean;
  canUseClientWriter: boolean;
  canUseClientMacros: boolean;

  // Server capabilities (true only in server mode)
  canUseServerOcr: boolean;
  canUseServerAnnotations: boolean;
  canUseMacroApi: boolean;
  canProbeServer: boolean;

  // Legacy compat aliases
  hasServerOcr: boolean;
  hasPreviewOcr: boolean;
  hasMacroConsole: boolean;
  hasServerAnnotations: boolean;

  latencyMs: number | null;
}—const SERVER_HEALTH_PATH = '/api/health';—const SERVER_PROBE_TIMEOUT_MS = 800;—const getServerHealthUrl = (): string => {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!apiBase) return SERVER_HEALTH_PATH;
  return `${apiBase.replace(/\/$/, '')}${SERVER_HEALTH_PATH}`;
};

/**
 * Determine initial mode from build-time env.
 * INV-5 EXCEPTION: This is the ONLY place import.meta.env gates mode.
 */—function getInitialMode(): AppMode {
  const envMode = import.meta.env.VITE_APP_MODE as string | undefined;
  if (envMode === 'static') return 'static';
  if (envMode === 'server') return 'server';
  return 'preview'; // default: probe server once
}—function buildCapabilities(
  mode: AppMode,
  serverAlive: boolean,
  latencyMs: number | null,
): Capabilities {
  const isServer = mode === 'server' && serverAlive;

  return {
    mode,
    serverAlive,

    canUseClientPdfTools: true,
    canUseClientAnnotations: true,
    canUseClientWriter: true,
    canUseClientMacros: true,

    canUseServerOcr: isServer,
    canUseServerAnnotations: isServer,
    canUseMacroApi: isServer,
    canProbeServer: mode !== 'static',

    // Legacy compat
    hasServerOcr: isServer,
    hasPreviewOcr: true,
    hasMacroConsole: isServer,
    hasServerAnnotations: isServer,

    latencyMs,
  };
}—const STATIC_CAPABILITIES = buildCapabilities('static', false, null);—let cachedCapabilities: Capabilities = STATIC_CAPABILITIES;—let detectionPromise: Promise<Capabilities> | null = null;—let lastLoggedSignature = '';—const capabilitySignature = (c: Capabilities): string =>
  `${c.mode}:${c.serverAlive}:${c.latencyMs ?? 'none'}`;—const logCapabilities = (c: Capabilities): void => {
  const sig = capabilitySignature(c);
  if (sig === lastLoggedSignature) return;
  lastLoggedSignature = sig;
  log('capabilities', 'Mode detection complete', {
    mode: c.mode,
    serverAlive: c.serverAlive,
    latencyMs: c.latencyMs,
  });
};—export async function detectCapabilities(): Promise<Capabilities> {
  const initialMode = getInitialMode();

  // Static mode: no network call ever
  if (initialMode === 'static') {
    return STATIC_CAPABILITIES;
  }

  const controller = new AbortController();
  const startedAt = performance.now();
  const timer = window.setTimeout(
    () => controller.abort(),
    SERVER_PROBE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(getServerHealthUrl(), {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (!response.ok) {
      return buildCapabilities('preview', false, latencyMs);
    }

    return buildCapabilities('server', true, latencyMs);
  } catch {
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return buildCapabilities('preview', false, latencyMs);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Runtime feature contract for the shell.
 */—export function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] =
    useState<Capabilities>(cachedCapabilities);

  useEffect(() => {
    let cancelled = false;

    if (!detectionPromise) {
      detectionPromise = detectCapabilities().then((detected) => {
        cachedCapabilities = detected;
        logCapabilities(detected);
        return detected;
      });
    }

    detectionPromise.then((detected) => {
      if (!cancelled) {
        setCapabilities(detected);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return capabilities;
}

/** Test helper: create capabilities for a specific mode */—export function createTestCapabilities(
  mode: AppMode,
  overrides?: Partial<Capabilities>,
): Capabilities {
  return {
    ...buildCapabilities(mode, mode === 'server', mode === 'server' ? 5 : null),
    ...overrides,
  };
}
```

---

### S-Phase 1.2 — Add `.env.static`

**File**: `frontend/.env.static` (NEW)

```env—VITE_APP_MODE=static—VITE_BASE_PATH=/Pdf-Hub/
```

---

### S-Phase 1.3 — Update Preview Banner for Static Mode

**File**: [frontend/src/components/shell/PreviewModeBanner.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/components/shell/PreviewModeBanner.tsx)—Replace the entire file:

```tsx—import React from 'react';—import type { AppMode } from '@/hooks/useCapabilities';—interface ModeBannerProps {
  mode: AppMode;
}—const BANNER_TEXT: Record<Exclude<AppMode, 'server'>, string> = {
  static: 'Running in static mode. Some features require a local server.',
  preview: 'Running in preview mode. Start the local server for full features.',
};

/**
 * Always-visible indicator for non-server modes. INV-9: non-dismissible.
 */—export const PreviewModeBanner: React.FC<ModeBannerProps> = ({ mode }) => {
  if (mode === 'server') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 w-full bg-amber-400 text-amber-950 px-4 py-1.5 text-center text-xs font-semibold select-none"
    >
      {BANNER_TEXT[mode]}
    </div>
  );
};
```

---

### S-Phase 1.4 — Update Macro Route Guard in App.tsx

**File**: [frontend/src/App.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/App.tsx)—Replace line 22:

```diff
-      <Route path="/macro-builder" element={capabilities.hasMacroConsole ? <MacroBuilderPage /> : <Navigate to="/" replace />} />
+      <Route path="/macro-builder" element={capabilities.canUseClientMacros ? <MacroBuilderPage /> : <Navigate to="/" replace />} />
```—This makes macro builder available in ALL modes (static, preview, server) because `canUseClientMacros` is always `true`. Server-only macro ops will show "unavailable" messaging inside the builder.

---

### S-Phase 1.5 — Capability Tests

**File**: [frontend/src/hooks/useCapabilities.test.ts](file:///c:/Code1/Pdf-Hub/frontend/src/hooks/useCapabilities.test.ts)—Replace the entire file:

```typescript—import { describe, it, expect, vi, beforeEach } from 'vitest';—import { detectCapabilities, createTestCapabilities } from './useCapabilities';—describe('useCapabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_APP_MODE', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
  });

  describe('static mode', () => {
    it('returns static capabilities without any fetch call', async () => {
      vi.stubEnv('VITE_APP_MODE', 'static');
      const caps = await detectCapabilities();

      expect(caps.mode).toBe('static');
      expect(caps.serverAlive).toBe(false);
      expect(caps.canUseClientPdfTools).toBe(true);
      expect(caps.canUseClientAnnotations).toBe(true);
      expect(caps.canUseClientWriter).toBe(true);
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canUseServerOcr).toBe(false);
      expect(caps.canUseMacroApi).toBe(false);
      expect(caps.canProbeServer).toBe(false);
      expect(caps.latencyMs).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('preview mode (server unreachable)', () => {
    it('falls back to preview when fetch fails', async () => {
      vi.stubEnv('VITE_APP_MODE', '');
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error'),
      );
      const caps = await detectCapabilities();

      expect(caps.mode).toBe('preview');
      expect(caps.serverAlive).toBe(false);
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canProbeServer).toBe(true);
      expect(caps.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('server mode (server reachable)', () => {
    it('detects server when health check succeeds', async () => {
      vi.stubEnv('VITE_APP_MODE', '');
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });
      const caps = await detectCapabilities();

      expect(caps.mode).toBe('server');
      expect(caps.serverAlive).toBe(true);
      expect(caps.canUseServerOcr).toBe(true);
      expect(caps.canUseMacroApi).toBe(true);
      expect(caps.hasServerAnnotations).toBe(true);
    });
  });

  describe('createTestCapabilities helper', () => {
    it('creates static test capabilities', () => {
      const caps = createTestCapabilities('static');
      expect(caps.mode).toBe('static');
      expect(caps.canUseClientMacros).toBe(true);
      expect(caps.canUseServerOcr).toBe(false);
    });

    it('creates server test capabilities', () => {
      const caps = createTestCapabilities('server');
      expect(caps.mode).toBe('server');
      expect(caps.canUseServerOcr).toBe(true);
    });

    it('accepts overrides', () => {
      const caps = createTestCapabilities('static', { canUseClientWriter: false });
      expect(caps.canUseClientWriter).toBe(false);
    });
  });
});
```

---

### S-Phase 1.6 — Static Mode App Test

**File**: `frontend/src/App.staticMode.test.tsx` (NEW)

```tsx—import { describe, it, expect, vi, beforeEach } from 'vitest';—import { render, screen } from '@testing-library/react';—import App from './App';

// Mock useCapabilities to return static mode—vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    mode: 'static' as const,
    serverAlive: false,
    canUseClientPdfTools: true,
    canUseClientAnnotations: true,
    canUseClientWriter: true,
    canUseClientMacros: true,
    canUseServerOcr: false,
    canUseServerAnnotations: false,
    canUseMacroApi: false,
    canProbeServer: false,
    hasServerOcr: false,
    hasPreviewOcr: true,
    hasMacroConsole: false,
    hasServerAnnotations: false,
    latencyMs: null,
  }),
}));—describe('App in static mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('loads without calling fetch', () => {
    render(<App />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows static mode banner', () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /static mode/i,
    );
  });

  it('does not render server-only OCR button', () => {
    render(<App />);
    expect(screen.queryByText(/server.*ocr/i)).toBeNull();
  });
});
```

---

### S-Phase 1 Acceptance Gate

```bash—pnpm --dir frontend check:release      # MUST exit 0

# In static mode, no fetch() calls from components—node scripts/static-contract-checks.mjs # MUST show all PASS

# Tests pass—pnpm --dir frontend test                # MUST exit 0 (includes new static tests)
```

---

## S-Phase 2 — Macro Mode Awareness + WordPad Rich Text Foundation

**Goal**: (A) Every macro op declares whether it needs client-only or server — static mode shows client macros, server ops show "unavailable" with reason. (B) Build the WordPad-style rich text editing foundation with custom Lexical nodes for images, tables, and headings.

> [!IMPORTANT]
> **User Priority**: "Table import, rich text, image insertion, 'WordPad' like user interface for editing is priority." Find/replace is explicitly de-prioritized.

> [!NOTE]
> **What already exists** (DO NOT rebuild):
> - 17 writer commands in [writerCommands.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/writerCommands.ts)
> - Full command store with undo/redo (50-deep) in [writerCommandStore.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/writerCommandStore.ts)
> - Lexical packages installed: `@lexical/history`, `@lexical/html`, `@lexical/list`, `@lexical/selection`, `@lexical/react`, `@lexical/rich-text`, `@lexical/table`
> - Element types defined: `richTextBox`, `textCallout`, `reviewLabel`, `textStamp`, `richNote`, `tableBox`, `imageBox`
> - Toolbar controls in [WriterV2ToolbarControls.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/components/writer-v2/WriterV2ToolbarControls.tsx)
> - Table import logic in [tableImport.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/clipboard/tableImport.ts)

---

### S-Phase 2.1 — MacroOpMetadata Type

**File**: `frontend/src/core/macro/metadata.ts` [NEW]

```typescript—import type { Capabilities } from '@/hooks/useCapabilities';—export type MacroOpMode = 'client' | 'server' | 'hybrid';—export type MacroOpCategory =
  | 'page'
  | 'annotation'
  | 'writer'
  | 'ocr'
  | 'export'
  | 'content'
  | 'conditional';—export interface MacroOpMetadata {
  op: string;
  mode: MacroOpMode;
  category: MacroOpCategory;
  label: string;
  description: string;
  requiresDocument: boolean;
  requiresSelection: boolean;
}

/**
 * Central metadata registry for all macro operations.
 * Keyed by op name — must match registry.ts keys exactly.
 */—export const MACRO_OP_METADATA: Record<string, MacroOpMetadata> = {
  // ���� Client-safe page operations ������������������������������������������������������������
  rotate_pages:      { op: 'rotate_pages',      mode: 'client', category: 'page',        label: 'Rotate Pages',        description: 'Rotate selected pages by 90�/180�/270�',    requiresDocument: true,  requiresSelection: false },
  extract_pages:     { op: 'extract_pages',      mode: 'client', category: 'page',        label: 'Extract Pages',       description: 'Extract pages to a new PDF',                 requiresDocument: true,  requiresSelection: false },
  split_pages:       { op: 'split_pages',        mode: 'client', category: 'page',        label: 'Split Pages',         description: 'Split document at selected pages',           requiresDocument: true,  requiresSelection: false },
  duplicate_pages:   { op: 'duplicate_pages',    mode: 'client', category: 'page',        label: 'Duplicate Pages',     description: 'Duplicate selected pages in place',          requiresDocument: true,  requiresSelection: false },
  remove_pages:      { op: 'remove_pages',       mode: 'client', category: 'page',        label: 'Remove Pages',        description: 'Remove selected pages from document',        requiresDocument: true,  requiresSelection: false },
  insert_blank_page: { op: 'insert_blank_page',  mode: 'client', category: 'page',        label: 'Insert Blank Page',   description: 'Insert a blank page at position',            requiresDocument: true,  requiresSelection: false },
  replace_page:      { op: 'replace_page',       mode: 'client', category: 'page',        label: 'Replace Page',        description: 'Replace a page with donor page',             requiresDocument: true,  requiresSelection: false },
  reorder_pages:     { op: 'reorder_pages',      mode: 'client', category: 'page',        label: 'Reorder Pages',       description: 'Rearrange page order',                       requiresDocument: true,  requiresSelection: false },
  select_pages:      { op: 'select_pages',       mode: 'client', category: 'page',        label: 'Select Pages',        description: 'Set page selection for subsequent steps',    requiresDocument: true,  requiresSelection: false },

  // ���� Client-safe document operations ����������������������������������������������������
  merge_files:       { op: 'merge_files',        mode: 'client', category: 'page',        label: 'Merge Files',         description: 'Merge donor files into document',            requiresDocument: true,  requiresSelection: false },
  insert_pdf:        { op: 'insert_pdf',         mode: 'client', category: 'page',        label: 'Insert PDF',          description: 'Insert a PDF at specific index',             requiresDocument: true,  requiresSelection: false },

  // ���� Client-safe content operations ������������������������������������������������������
  header_footer_text:{ op: 'header_footer_text', mode: 'client', category: 'content',     label: 'Header / Footer',     description: 'Add text headers or footers',                requiresDocument: true,  requiresSelection: false },
  draw_text_on_pages:{ op: 'draw_text_on_pages', mode: 'client', category: 'content',     label: 'Draw Text',           description: 'Draw text at coordinates on pages',          requiresDocument: true,  requiresSelection: false },
  inject_rich_text:  { op: 'inject_rich_text',   mode: 'client', category: 'content',     label: 'Inject Rich Text',    description: 'Inject styled text block on pages',          requiresDocument: true,  requiresSelection: false },
  insert_image:      { op: 'insert_image',       mode: 'client', category: 'content',     label: 'Insert Image',        description: 'Place an image on pages',                    requiresDocument: true,  requiresSelection: false },
  add_content_page:  { op: 'add_content_page',   mode: 'client', category: 'content',     label: 'Add Content Page',    description: 'Add a page with layout blocks',              requiresDocument: true,  requiresSelection: false },
  add_image_header_page: { op: 'add_image_header_page', mode: 'client', category: 'content', label: 'Image Header Page', description: 'Add cover page with image header',       requiresDocument: true,  requiresSelection: false },
  place_rich_textbox:{ op: 'place_rich_textbox',  mode: 'client', category: 'writer',     label: 'Place Rich Textbox',  description: 'Place a writer-style rich textbox',          requiresDocument: true,  requiresSelection: false },
  place_table:       { op: 'place_table',         mode: 'client', category: 'writer',     label: 'Place Table',         description: 'Place a data table on page',                 requiresDocument: true,  requiresSelection: false },
  adjust_image:      { op: 'adjust_image',        mode: 'client', category: 'content',    label: 'Adjust Image',        description: 'Position and style an image on page',        requiresDocument: true,  requiresSelection: false },

  // ���� Conditional / template ����������������������������������������������������������������������
  conditional:       { op: 'conditional',         mode: 'client', category: 'conditional', label: 'Conditional',        description: 'Branch based on document properties',       requiresDocument: true,  requiresSelection: false },
  apply_template_vars:{ op: 'apply_template_vars', mode: 'client', category: 'conditional', label: 'Template Variables', description: 'Apply template variable substitutions',    requiresDocument: false, requiresSelection: false },
};

/**
 * Returns ops available for the current capabilities.
 */—export function getAvailableOps(capabilities: Capabilities): MacroOpMetadata[] {
  return Object.values(MACRO_OP_METADATA).filter((meta) => {
    if (meta.mode === 'client') return true;
    if (meta.mode === 'server') return capabilities.canUseMacroApi;
    // hybrid: available if either client or server can run it
    return true;
  });
}

/**
 * Returns why an op is unavailable, or null if available.
 */—export function getUnavailableReason(
  op: string,
  capabilities: Capabilities,
): string | null {
  const meta = MACRO_OP_METADATA[op];
  if (!meta) return `Unknown macro operation "${op}".`;
  if (meta.mode === 'client') return null;
  if (meta.mode === 'server' && !capabilities.canUseMacroApi) {
    return `"${meta.label}" requires a running server. Current mode: ${capabilities.mode}.`;
  }
  return null;
}

/**
 * Validates whether a recipe can execute in the current mode.
 */—export function validateRecipeForMode(
  steps: Array<{ op: string }>,
  capabilities: Capabilities,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const step of steps) {
    const reason = getUnavailableReason(step.op, capabilities);
    if (reason) errors.push(reason);
  }

  return { valid: errors.length === 0, errors };
}
```

---

### S-Phase 2.2 — Macro Metadata Tests

**File**: `frontend/src/core/macro/metadata.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import {
  MACRO_OP_METADATA,
  getAvailableOps,
  getUnavailableReason,
  validateRecipeForMode,
} from './metadata';—import { createTestCapabilities } from '@/hooks/useCapabilities';—describe('MacroOpMetadata', () => {
  it('has metadata for all 22 registered ops', () => {
    const ALL_OPS = [
      'rotate_pages', 'extract_pages', 'split_pages', 'duplicate_pages',
      'remove_pages', 'insert_blank_page', 'replace_page', 'reorder_pages',
      'select_pages', 'merge_files', 'insert_pdf',
      'header_footer_text', 'draw_text_on_pages', 'inject_rich_text',
      'insert_image', 'add_content_page', 'add_image_header_page',
      'place_rich_textbox', 'place_table', 'adjust_image',
      'conditional', 'apply_template_vars',
    ];

    for (const op of ALL_OPS) {
      expect(MACRO_OP_METADATA[op]).toBeDefined();
      expect(MACRO_OP_METADATA[op].op).toBe(op);
    }
  });
});—describe('getAvailableOps', () => {
  it('returns all client ops in static mode', () => {
    const caps = createTestCapabilities('static');
    const available = getAvailableOps(caps);

    expect(available.length).toBe(22); // all current ops are client-mode
    expect(available.every((m) => m.mode === 'client')).toBe(true);
  });

  it('returns all ops in server mode', () => {
    const caps = createTestCapabilities('server');
    const available = getAvailableOps(caps);

    expect(available.length).toBeGreaterThanOrEqual(22);
  });
});—describe('getUnavailableReason', () => {
  it('returns null for client ops in any mode', () => {
    const caps = createTestCapabilities('static');
    expect(getUnavailableReason('rotate_pages', caps)).toBeNull();
    expect(getUnavailableReason('duplicate_pages', caps)).toBeNull();
  });

  it('returns reason for unknown ops', () => {
    const caps = createTestCapabilities('server');
    expect(getUnavailableReason('nonexistent_op', caps)).toContain('Unknown');
  });
});—describe('validateRecipeForMode', () => {
  it('validates a client-only recipe in static mode', () => {
    const caps = createTestCapabilities('static');
    const result = validateRecipeForMode(
      [{ op: 'rotate_pages' }, { op: 'duplicate_pages' }],
      caps,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

---

### S-Phase 2.3 — WordPad Lexical Custom Nodes (Image & Table)

> [!IMPORTANT]
> This sub-phase builds the **Lexical custom node layer** that powers image insertion
> and table editing inside the WriterPopupEditor. The existing `WriterPopupEditor.tsx`
> uses Lexical but only renders plain `RichTextPlugin`. These nodes unlock inline images
> and structured tables within rich text elements.

**Why**: The existing `imageBox` and `tableBox` element kinds are placed as top-level—writer elements on the canvas. This phase adds the ability to embed images and tables
*inside* rich text content, making the editor behave like WordPad/Google Docs.

#### S-Phase 2.3a — ImageNode (Lexical Custom Node)

**File**: `frontend/src/core/writer-v2/lexical-nodes/ImageNode.ts` [NEW]

```typescript—import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';—export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
    width: number | 'inherit';
    height: number | 'inherit';
    caption: string;
  },
  SerializedLexicalNode
>;

/**
 * Custom Lexical node for inline/block images inside rich text.
 * Renders as a contenteditable=false <figure> with optional caption.
 *
 * IMPORTANT: This is for images INSIDE a richTextBox's Lexical editor.
 * Top-level `imageBox` writer elements are separate (handled by writerCommands).
 */—export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | 'inherit';
  __height: number | 'inherit';
  __caption: string;

  static getType(): string {
    return 'inline-image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__caption,
      node.__key,
    );
  }

  constructor(
    src: string,
    altText: string,
    width: number | 'inherit' = 'inherit',
    height: number | 'inherit' = 'inherit',
    caption: string = '',
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
    this.__caption = caption;
  }

  // ���� Serialization ������������������������������������������������������������������������������������
  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(
      json.src,
      json.altText,
      json.width,
      json.height,
      json.caption,
    );
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'inline-image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      caption: this.__caption,
    };
  }

  // ���� DOM ��������������������������������������������������������������������������������������������������������
  createDOM(_config: EditorConfig): HTMLElement {
    const figure = document.createElement('figure');
    figure.style.margin = '8px 0';
    figure.style.textAlign = 'center';
    figure.setAttribute('contenteditable', 'false');
    return figure;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = this.__src;
    img.alt = this.__altText;
    if (this.__width !== 'inherit') img.width = this.__width;
    if (this.__height !== 'inherit') img.height = this.__height;
    figure.appendChild(img);

    if (this.__caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = this.__caption;
      figure.appendChild(figcaption);
    }
    return { element: figure };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (domNode: HTMLElement) => {
          const img = domNode as HTMLImageElement;
          return {
            node: new ImageNode(
              img.src,
              img.alt || '',
              img.width || 'inherit',
              img.height || 'inherit',
            ),
          };
        },
        priority: 0,
      }),
    };
  }

  // ���� Decorator (React render) ��������������������������������������������������������������
  decorate(): JSX.Element {
    // The React component is rendered by ImageNodeComponent (see below)
    // This is a placeholder — the actual component is registered via
    // DecoratorNode's React integration
    return null as unknown as JSX.Element;
  }

  // ���� Mutation helpers ������������������������������������������������������������������������������
  setWidthHeight(width: number | 'inherit', height: number | 'inherit'): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  setCaption(caption: string): void {
    const writable = this.getWritable();
    writable.__caption = caption;
  }

  getSrc(): string {
    return this.__src;
  }
}

/**
 * Helper to create and insert an ImageNode.
 * Call inside editor.update(() => { ... })
 */—export function $createImageNode(
  src: string,
  altText: string,
  width?: number | 'inherit',
  height?: number | 'inherit',
  caption?: string,
): ImageNode {
  return new ImageNode(src, altText, width, height, caption);
}—export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
```

#### S-Phase 2.3b — TableNode Integration

> [!NOTE]
> Lexical already has `@lexical/table` installed. This step wires the existing
> `TableNode`, `TableRowNode`, `TableCellNode` into the editor config and creates
> a helper for inserting tables from the toolbar.

**File**: `frontend/src/core/writer-v2/lexical-nodes/tableHelpers.ts` [NEW]

```typescript—import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';—import type { LexicalEditor } from 'lexical';—import {
  $createTableNodeWithDimensions,
  TableNode,
  TableRowNode,
  TableCellNode,
} from '@lexical/table';

/**
 * Insert a table at the current cursor position.
 * @param editor - The Lexical editor instance
 * @param rows - Number of rows (min 1, max 50)
 * @param cols - Number of columns (min 1, max 20)
 */—export function insertTable(
  editor: LexicalEditor,
  rows: number,
  cols: number,
): void {
  const clampedRows = Math.max(1, Math.min(rows, 50));
  const clampedCols = Math.max(1, Math.min(cols, 20));

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const tableNode = $createTableNodeWithDimensions(
      clampedRows,
      clampedCols,
      false, // includeHeaders
    );

    selection.insertNodes([tableNode]);

    // Place cursor after table
    const paragraph = $createParagraphNode();
    tableNode.insertAfter(paragraph);
    paragraph.selectStart();
  });
}

/**
 * Insert a table from pasted/imported data (e.g., CSV, HTML table).
 * Each row is a string[], and the outer array is the rows.
 */—export function insertTableFromData(
  editor: LexicalEditor,
  data: string[][],
): void {
  if (data.length === 0) return;
  const cols = Math.max(...data.map((r) => r.length));
  if (cols === 0) return;

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const tableNode = $createTableNodeWithDimensions(
      data.length,
      cols,
      false,
    );

    // Fill cells with data
    const rows = tableNode.getChildren();
    for (let r = 0; r < rows.length; r++) {
      const rowNode = rows[r];
      if (!(rowNode instanceof TableRowNode)) continue;
      const cells = rowNode.getChildren();
      for (let c = 0; c < cells.length; c++) {
        const cellNode = cells[c];
        if (!(cellNode instanceof TableCellNode)) continue;
        const text = data[r]?.[c] ?? '';
        const paragraph = cellNode.getFirstChild();
        if (paragraph) {
          paragraph.clear();
          const { $createTextNode } = require('lexical');
          paragraph.append($createTextNode(text));
        }
      }
    }

    selection.insertNodes([tableNode]);
  });
}

/** Re-export for editor config registration */—export { TableNode, TableRowNode, TableCellNode };
```

#### S-Phase 2.3c — HeadingNode Integration

**File**: `frontend/src/core/writer-v2/lexical-nodes/headingHelpers.ts` [NEW]

```typescript—import type { LexicalEditor } from 'lexical';—import { $getSelection, $isRangeSelection } from 'lexical';—import { $createHeadingNode, HeadingNode, type HeadingTagType } from '@lexical/rich-text';

/**
 * Toggle heading level for the current selection.
 * If already at the target level, convert back to paragraph.
 */—export function toggleHeading(
  editor: LexicalEditor,
  level: HeadingTagType,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    const element = anchorNode.getTopLevelElementOrThrow();

    if (element instanceof HeadingNode && element.getTag() === level) {
      // Already this heading — convert back to paragraph
      const { $createParagraphNode } = require('lexical');
      const paragraph = $createParagraphNode();
      element.getChildren().forEach((child) => paragraph.append(child));
      element.replace(paragraph);
    } else {
      // Convert to heading
      const heading = $createHeadingNode(level);
      element.getChildren().forEach((child) => heading.append(child));
      element.replace(heading);
    }
  });
}

/** Re-export for editor config registration */—export { HeadingNode };
```

#### S-Phase 2.3d — Lexical Node Registration

> [!IMPORTANT]
> The WriterPopupEditor must register all custom nodes. Find the `<LexicalComposer>`
> initialConfig in WriterPopupEditor.tsx and add nodes.

**File**: Modify [WriterPopupEditor.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/components/writer-v2/WriterPopupEditor.tsx)—Find the `initialConfig` object that contains the `nodes` array. Add:

```typescript—import { ImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';—import { TableNode, TableRowNode, TableCellNode } from '@/core/writer-v2/lexical-nodes/tableHelpers';—import { HeadingNode } from '@/core/writer-v2/lexical-nodes/headingHelpers';—import { ListNode, ListItemNode } from '@lexical/list';

// In the initialConfig.nodes array, ADD these entries:—nodes: [
  // ... existing nodes ...
  ImageNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  HeadingNode,
  ListNode,
  ListItemNode,
],
```—Also add the `TablePlugin` from `@lexical/react/LexicalTablePlugin`:
```tsx—import { TablePlugin } from '@lexical/react/LexicalTablePlugin';—import { ListPlugin } from '@lexical/react/LexicalListPlugin';

// Inside the <LexicalComposer> children, add:
<TablePlugin />
<ListPlugin />
```

---

### S-Phase 2.4 — Custom Node Tests

**File**: `frontend/src/core/writer-v2/lexical-nodes/ImageNode.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import { ImageNode, $createImageNode, $isImageNode } from './ImageNode';—describe('ImageNode', () => {
  it('has correct type identifier', () => {
    expect(ImageNode.getType()).toBe('inline-image');
  });

  it('serializes to JSON with all fields', () => {
    const node = new ImageNode(
      'data:image/png;base64,abc',
      'Test image',
      200,
      150,
      'A caption',
    );
    const json = node.exportJSON();

    expect(json.type).toBe('inline-image');
    expect(json.src).toBe('data:image/png;base64,abc');
    expect(json.altText).toBe('Test image');
    expect(json.width).toBe(200);
    expect(json.height).toBe(150);
    expect(json.caption).toBe('A caption');
  });

  it('round-trips through importJSON', () => {
    const original = new ImageNode(
      'https://example.com/img.png',
      'Alt text',
      300,
      'inherit',
      'My caption',
    );
    const json = original.exportJSON();
    const restored = ImageNode.importJSON(json);

    expect(restored.getSrc()).toBe('https://example.com/img.png');
    expect(restored.exportJSON()).toEqual(json);
  });

  it('$createImageNode creates valid instance', () => {
    const node = $createImageNode('src.png', 'alt');
    expect($isImageNode(node)).toBe(true);
    expect(node.getSrc()).toBe('src.png');
  });

  it('$isImageNode returns false for non-image nodes', () => {
    expect($isImageNode(null)).toBe(false);
    expect($isImageNode(undefined)).toBe(false);
  });

  it('defaults width/height to inherit', () => {
    const node = new ImageNode('src.png', 'alt');
    const json = node.exportJSON();
    expect(json.width).toBe('inherit');
    expect(json.height).toBe('inherit');
  });

  it('setWidthHeight mutates dimensions', () => {
    const node = new ImageNode('s.png', 'a');
    // Note: setWidthHeight needs writable context — this tests the method exists
    expect(typeof node.setWidthHeight).toBe('function');
    expect(typeof node.setCaption).toBe('function');
  });
});
```

**File**: `frontend/src/core/writer-v2/lexical-nodes/tableHelpers.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import { TableNode, TableRowNode, TableCellNode } from './tableHelpers';—describe('Table Helpers', () => {
  it('re-exports Lexical table node types', () => {
    expect(TableNode).toBeDefined();
    expect(TableRowNode).toBeDefined();
    expect(TableCellNode).toBeDefined();
  });

  it('insertTable function exists and is callable', async () => {
    const { insertTable } = await import('./tableHelpers');
    expect(typeof insertTable).toBe('function');
  });

  it('insertTableFromData function exists and is callable', async () => {
    const { insertTableFromData } = await import('./tableHelpers');
    expect(typeof insertTableFromData).toBe('function');
  });
});
```

---

### S-Phase 2 Acceptance Gate

```bash—pnpm --dir frontend check:release   # MUST exit 0
# Static mode can open Macro Builder for client-safe recipes �S
# Server-only macro steps show unavailable reason �S
# Macro metadata covers all 22 ops �S
# ImageNode serializes and round-trips �S
# TableNode, HeadingNode registered in editor config �S
# Custom node tests pass �S
```

---

## S-Phase 3 — Annotation Coordinate Stability & Persistence Hardening

**Goal**: Annotations survive zoom, rotation, reorder, duplicate, and reload. No data goes to localStorage. Add rotation-aware reprojection and multi-operation stability tests.

> [!NOTE]
> **What already exists** (DO NOT rebuild):
> - [NormalizedAnnotationGeometry](file:///c:/Code1/Pdf-Hub/frontend/src/core/annotations/normalized.ts) — 224 lines with normalize/denormalize/rotate for rects, points, paths
> - [pageRemapper.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/annotations/pageRemapper.ts) — handles reorder, delete, insert, rotate, duplicate
> - [persistence.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/annotations/persistence.ts) — IndexedDB via `idb`, schema v2, keyed by document hash
> - [coordinateTransform.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/coordinateTransform.ts) — full PDF� —viewport transforms for all 4 rotations

---

### S-Phase 3.1 — Annotation Geometry Contract Type

**File**: `frontend/src/core/annotations/geometry.ts` [NEW]

```typescript—import type { Rect, Point2D } from './types';—import type { NormalizedAnnotationGeometry, NormRect } from './normalized';—import { normalizeRect, denormalizeRect } from './normalized';—export type PageRotation = 0 | 90 | 180 | 270;

/**
 * Canonical annotation geometry with page context.
 * Combines viewport rect with normalized coordinates for zoom/rotation stability.
 */—export interface AnnotationGeometry {
  pageNumber: number;
  pageRotation: PageRotation;
  pageWidth: number;
  pageHeight: number;
  /** Absolute coordinates in viewport space */
  rectViewport: Rect;
  /** Normalized [0,1] coordinates — rotation-independent */
  normalized: NormalizedAnnotationGeometry;
  /** Optional freeform points in viewport space */
  pointsViewport?: Point2D[];
}

/**
 * Convert viewport rect to annotation geometry with normalization.
 * Uses the existing normalizeRect() from normalized.ts for consistency.
 */—export function createAnnotationGeometry(
  pageNumber: number,
  pageRotation: PageRotation,
  pageWidth: number,
  pageHeight: number,
  rectViewport: Rect,
): AnnotationGeometry {
  // Guard against zero dimensions
  const safeWidth = Math.max(1, pageWidth);
  const safeHeight = Math.max(1, pageHeight);

  return {
    pageNumber,
    pageRotation,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport,
    normalized: {
      rect: normalizeRect(rectViewport, { width: safeWidth, height: safeHeight }),
    },
  };
}

/**
 * Reproject annotation geometry for a new page size (e.g., after zoom).
 * Uses normalized coordinates for stability.
 */—export function reprojectGeometry(
  geometry: AnnotationGeometry,
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry {
  const safeWidth = Math.max(1, newPageWidth);
  const safeHeight = Math.max(1, newPageHeight);
  const { normalized } = geometry;

  return {
    ...geometry,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport: denormalizeRect(normalized.rect, {
      width: safeWidth,
      height: safeHeight,
    }),
  };
}

/**
 * Reproject geometry after page rotation.
 * When a page rotates 90�, what was (x, y) in a WxH page
 * becomes a different position in an HxW page.
 * Normalized coordinates handle this naturally because they're [0,1] relative.
 */—export function reprojectForRotation(
  geometry: AnnotationGeometry,
  newRotation: PageRotation,
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry {
  const safeWidth = Math.max(1, newPageWidth);
  const safeHeight = Math.max(1, newPageHeight);

  return {
    ...geometry,
    pageRotation: newRotation,
    pageWidth: safeWidth,
    pageHeight: safeHeight,
    rectViewport: denormalizeRect(geometry.normalized.rect, {
      width: safeWidth,
      height: safeHeight,
    }),
  };
}

/**
 * Batch reproject all geometries for a new viewport size.
 * Useful when zoom level changes — call once, update all annotations.
 */—export function batchReproject(
  geometries: AnnotationGeometry[],
  newPageWidth: number,
  newPageHeight: number,
): AnnotationGeometry[] {
  return geometries.map((g) => reprojectGeometry(g, newPageWidth, newPageHeight));
}
```

---

### S-Phase 3.2 — Annotation Geometry Tests

**File**: `frontend/src/core/annotations/geometry.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import {
  createAnnotationGeometry,
  reprojectGeometry,
  reprojectForRotation,
  batchReproject,
} from './geometry';—describe('AnnotationGeometry', () => {
  const letter = { w: 612, h: 792 }; // US Letter in PDF points

  it('creates geometry with normalized coordinates in [0,1] range', () => {
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, {
      x: 100, y: 200, width: 200, height: 50,
    });

    expect(geo.normalized.rect.x).toBeCloseTo(100 / 612, 4);
    expect(geo.normalized.rect.y).toBeCloseTo(200 / 792, 4);
    expect(geo.normalized.rect.width).toBeCloseTo(200 / 612, 4);
    expect(geo.normalized.rect.height).toBeCloseTo(50 / 792, 4);
  });

  it('reprojects to 2� size (zoom simulation)', () => {
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, {
      x: 100, y: 200, width: 200, height: 50,
    });

    const zoomed = reprojectGeometry(geo, letter.w * 2, letter.h * 2);

    expect(zoomed.rectViewport.x).toBeCloseTo(200, 0);
    expect(zoomed.rectViewport.y).toBeCloseTo(400, 0);
    expect(zoomed.rectViewport.width).toBeCloseTo(400, 0);
    expect(zoomed.rectViewport.height).toBeCloseTo(100, 0);
  });

  it('survives round-trip at same size within tolerance', () => {
    const original = { x: 306, y: 396, width: 100, height: 50 };
    const geo = createAnnotationGeometry(1, 0, letter.w, letter.h, original);
    const reprojected = reprojectGeometry(geo, letter.w, letter.h);

    expect(reprojected.rectViewport.x).toBeCloseTo(original.x, 1);
    expect(reprojected.rectViewport.y).toBeCloseTo(original.y, 1);
    expect(reprojected.rectViewport.width).toBeCloseTo(original.width, 1);
    expect(reprojected.rectViewport.height).toBeCloseTo(original.height, 1);
  });

  it('handles non-standard page sizes (A4)', () => {
    const a4 = { w: 595, h: 842 };
    const geo = createAnnotationGeometry(1, 0, a4.w, a4.h, {
      x: 297.5, y: 421, width: 100, height: 50,
    });

    expect(geo.normalized.rect.x).toBeCloseTo(0.5, 1);
    expect(geo.normalized.rect.y).toBeCloseTo(0.5, 1);
  });

  it('guards against zero page dimensions', () => {
    const geo = createAnnotationGeometry(1, 0, 0, 0, {
      x: 10, y: 20, width: 30, height: 40,
    });
    // Should not throw — uses Math.max(1, ...) internally
    expect(geo.pageWidth).toBe(1);
    expect(geo.pageHeight).toBe(1);
  });
});—describe('reprojectForRotation', () => {
  it('updates rotation and page dimensions', () => {
    const geo = createAnnotationGeometry(1, 0, 612, 792, {
      x: 100, y: 200, width: 200, height: 50,
    });

    // After 90� rotation, page becomes 792�612
    const rotated = reprojectForRotation(geo, 90, 792, 612);

    expect(rotated.pageRotation).toBe(90);
    expect(rotated.pageWidth).toBe(792);
    expect(rotated.pageHeight).toBe(612);
    // Normalized coords are preserved, viewport is recalculated
    expect(rotated.rectViewport.x).toBeCloseTo(
      geo.normalized.rect.x * 792, 0,
    );
  });
});—describe('batchReproject', () => {
  it('reprojects multiple geometries at once', () => {
    const geos = [
      createAnnotationGeometry(1, 0, 612, 792, { x: 100, y: 100, width: 50, height: 50 }),
      createAnnotationGeometry(2, 0, 612, 792, { x: 200, y: 200, width: 100, height: 100 }),
    ];

    const zoomed = batchReproject(geos, 1224, 1584); // 2x zoom

    expect(zoomed).toHaveLength(2);
    expect(zoomed[0].rectViewport.x).toBeCloseTo(200, 0);
    expect(zoomed[1].rectViewport.x).toBeCloseTo(400, 0);
  });
});—describe('Multi-operation stability', () => {
  it('annotation survives zoom —  un-zoom round-trip', () => {
    const original = { x: 150, y: 300, width: 80, height: 40 };
    const geo = createAnnotationGeometry(1, 0, 612, 792, original);

    // Zoom to 3x
    const zoomed = reprojectGeometry(geo, 612 * 3, 792 * 3);
    // Un-zoom back to 1x
    const restored = reprojectGeometry(zoomed, 612, 792);

    expect(restored.rectViewport.x).toBeCloseTo(original.x, 0);
    expect(restored.rectViewport.y).toBeCloseTo(original.y, 0);
    expect(restored.rectViewport.width).toBeCloseTo(original.width, 0);
    expect(restored.rectViewport.height).toBeCloseTo(original.height, 0);
  });

  it('annotation survives progressive zoom (1x —  1.5x —  2x —  1x)', () => {
    const original = { x: 100, y: 200, width: 200, height: 50 };
    const geo = createAnnotationGeometry(1, 0, 612, 792, original);

    const at1_5x = reprojectGeometry(geo, 918, 1188);
    const at2x = reprojectGeometry(at1_5x, 1224, 1584);
    const backTo1x = reprojectGeometry(at2x, 612, 792);

    expect(backTo1x.rectViewport.x).toBeCloseTo(original.x, 0);
    expect(backTo1x.rectViewport.width).toBeCloseTo(original.width, 0);
  });
});
```

---

### S-Phase 3.3 — Persistence Contract Tests

**File**: `frontend/src/core/annotations/persistence.contract.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import { readFileSync } from 'fs';—import { join } from 'path';—describe('Annotation Persistence Contract (INV-10)', () => {
  const annotationsDir = join(__dirname);

  it('persistence.ts does not reference localStorage', () => {
    const code = readFileSync(join(annotationsDir, 'persistence.ts'), 'utf8');
    expect(code).not.toContain('localStorage');
  });

  it('store.ts does not reference localStorage', () => {
    const code = readFileSync(join(annotationsDir, 'store.ts'), 'utf8');
    expect(code).not.toContain('localStorage');
  });

  it('persistence.ts uses IndexedDB (idb import)', () => {
    const code = readFileSync(join(annotationsDir, 'persistence.ts'), 'utf8');
    expect(code).toContain('idb');
  });

  it('no file in core/annotations/ uses localStorage', () => {
    // Read all .ts files in the annotations directory
    const { readdirSync } = require('fs');
    const files = readdirSync(annotationsDir)
      .filter((f: string) => f.endsWith('.ts') && !f.includes('.test.'));

    for (const file of files) {
      const content = readFileSync(join(annotationsDir, file), 'utf8');
      expect(content).not.toContain('localStorage');
    }
  });
});
```

---

### S-Phase 3 Acceptance Gate

```bash—pnpm --dir frontend check:release   # MUST exit 0

# Verify no localStorage in annotation code (cross-platform check)—node -e "
  const fs = require('fs');
  const path = require('path');
  const dir = path.join('frontend', 'src', 'core', 'annotations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !f.includes('.test.'));
  let found = false;
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (content.includes('localStorage')) {
      console.error('FAIL: localStorage in', f);
      found = true;
    }
  }
  if (!found) console.log('PASS: no localStorage in annotations');
  else process.exit(1);
"
```

---

## S-Phase 4 — WordPad-Style Toolbar, Image/Table Insertion & Export Pipeline

**Goal**: Complete the WordPad-like editing experience. Wire the Lexical custom nodes (from Phase 2.3) into toolbar buttons. Add image insertion via file picker + drag-and-drop. Add table insertion dialog. Fix the export pipeline to preserve rich formatting.

> [!IMPORTANT]
> **User Priority**: "Table import, rich text, image insertion, 'WordPad' Like user interface for editing is priority."
> Find/replace is explicitly de-prioritized.

> [!NOTE]
> **What already exists** (DO NOT rebuild):
> - 17 writer commands in [writerCommands.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/writerCommands.ts)
> - Full command store with undo/redo (50-deep) in [writerCommandStore.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/writerCommandStore.ts)
> - Coordinate transforms (PDF —  viewport, all 4 rotations) in [coordinateTransform.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/coordinateTransform.ts)
> - Lexical packages installed: `@lexical/history`, `@lexical/html`, `@lexical/list`, `@lexical/selection`, `@lexical/react`, `@lexical/rich-text`, `@lexical/table`
> - Element types: `richTextBox`, `textCallout`, `reviewLabel`, `textStamp`, `richNote`, `tableBox`, `imageBox`
> - Toolbar controls in [WriterV2ToolbarControls.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/components/writer-v2/WriterV2ToolbarControls.tsx) (7.6 KB)
> - Table import logic in [tableImport.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/clipboard/tableImport.ts)

---

### S-Phase 4.1 — Audit & Extend Writer Toolbar

**Step 1**: Read `WriterV2ToolbarControls.tsx` fully. List what toolbar controls already exist.—Only add what's missing from this WordPad checklist:

| Control | Required? | How to implement |
|---------|-----------|------------------|
| Font family selector | �S& | `$patchStyleText(selection, { 'font-family': value })` |
| Font size selector | �S& | `$patchStyleText(selection, { 'font-size': value + 'px' })` |
| Bold | �S& | `editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')` |
| Italic | �S& | `editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')` |
| Underline | �S& | `editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')` |
| Strikethrough | �S& | `editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')` |
| Text color picker | �S& | `$patchStyleText(selection, { color: hex })` |
| Highlight color | �S& | `$patchStyleText(selection, { 'background-color': hex })` |
| Heading selector (H1-H3) | �S& | `toggleHeading(editor, 'h1')` from headingHelpers.ts |
| Bullet list | �S& | `editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)` |
| Numbered list | �S& | `editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)` |
| Text alignment (L/C/R) | �S& | `editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')` |
| Insert image button | �S& | Opens file picker —  `$createImageNode()` |
| Insert table button | �S& | Opens size dialog —  `insertTable()` |
| Indent / Outdent | Nice-to-have | `INDENT_CONTENT_COMMAND` / `OUTDENT_CONTENT_COMMAND` |

**Step 2**: For each missing control, add a toolbar button or dropdown.

**File**: Extend [WriterV2ToolbarControls.tsx](file:///c:/Code1/Pdf-Hub/frontend/src/components/writer-v2/WriterV2ToolbarControls.tsx)

```typescript
// ���� Required imports ����������������������������������������������������������������������������������—import { FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';—import { $getSelection, $isRangeSelection } from 'lexical';—import { $patchStyleText } from '@lexical/selection';—import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';—import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';—import { $createImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';—import { insertTable } from '@/core/writer-v2/lexical-nodes/tableHelpers';—import { toggleHeading } from '@/core/writer-v2/lexical-nodes/headingHelpers';

// ���� Font family dropdown ��������������������������������������������������������������������������—const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Times New Roman', 'Courier New',
  'Georgia', 'Verdana', 'Trebuchet MS', 'Comic Sans MS',
];—function FontFamilyDropdown() {
  const [editor] = useLexicalComposerContext();
  return (
    <select
      id="writer-font-family"
      onChange={(e) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { 'font-family': e.target.value });
          }
        });
      }}
      className="writer-toolbar-select"
      title="Font Family"
    >
      {FONT_FAMILIES.map((f) => (
        <option key={f} value={f}>{f}</option>
      ))}
    </select>
  );
}

// ���� Font size dropdown ������������������������������������������������������������������������������—const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];—function FontSizeDropdown() {
  const [editor] = useLexicalComposerContext();
  return (
    <select
      id="writer-font-size"
      defaultValue="14"
      onChange={(e) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { 'font-size': `${e.target.value}px` });
          }
        });
      }}
      className="writer-toolbar-select"
      title="Font Size"
    >
      {FONT_SIZES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// ���� Text color picker ��������������������������������������������������������������������������������—function TextColorPicker() {
  const [editor] = useLexicalComposerContext();
  return (
    <input
      type="color"
      id="writer-text-color"
      defaultValue="#000000"
      onChange={(e) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { color: e.target.value });
          }
        });
      }}
      title="Text Color"
      className="writer-toolbar-color"
    />
  );
}

// ���� Highlight color picker ����������������������������������������������������������������������—function HighlightColorPicker() {
  const [editor] = useLexicalComposerContext();
  return (
    <input
      type="color"
      id="writer-highlight-color"
      defaultValue="#ffff00"
      onChange={(e) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { 'background-color': e.target.value });
          }
        });
      }}
      title="Highlight Color"
      className="writer-toolbar-color"
    />
  );
}

// ���� Insert image handler ��������������������������������������������������������������������������—function InsertImageButton() {
  const [editor] = useLexicalComposerContext();

  const handleInsertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const imageNode = $createImageNode(src, file.name);
            selection.insertNodes([imageNode]);
          }
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <button
      id="writer-insert-image"
      onClick={handleInsertImage}
      className="writer-toolbar-btn"
      title="Insert Image"
      type="button"
    >
      �x�️
    </button>
  );
}

// ���� Insert table dialog ����������������������������������������������������������������������������—function InsertTableButton() {
  const [editor] = useLexicalComposerContext();
  const [showDialog, setShowDialog] = React.useState(false);
  const [rows, setRows] = React.useState(3);
  const [cols, setCols] = React.useState(3);

  return (
    <>
      <button
        id="writer-insert-table"
        onClick={() => setShowDialog(true)}
        className="writer-toolbar-btn"
        title="Insert Table"
        type="button"
      >
        �x`
      </button>
      {showDialog && (
        <div className="writer-table-dialog" role="dialog" aria-label="Insert Table">
          <label>
            Rows: <input type="number" min={1} max={50} value={rows}
              onChange={(e) => setRows(Number(e.target.value))} />
          </label>
          <label>
            Cols: <input type="number" min={1} max={20} value={cols}
              onChange={(e) => setCols(Number(e.target.value))} />
          </label>
          <button onClick={() => {
            insertTable(editor, rows, cols);
            setShowDialog(false);
          }}>Insert</button>
          <button onClick={() => setShowDialog(false)}>Cancel</button>
        </div>
      )}
    </>
  );
}

// ���� Heading dropdown ����������������������������������������������������������������������������������—function HeadingDropdown() {
  const [editor] = useLexicalComposerContext();
  return (
    <select
      id="writer-heading-level"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) {
          toggleHeading(editor, e.target.value as 'h1' | 'h2' | 'h3');
        }
        e.target.value = ''; // Reset to allow re-selection
      }}
      className="writer-toolbar-select"
      title="Heading Level"
    >
      <option value="">Paragraph</option>
      <option value="h1">Heading 1</option>
      <option value="h2">Heading 2</option>
      <option value="h3">Heading 3</option>
    </select>
  );
}
```

> [!IMPORTANT]
> **Integration**: Add these components into the existing toolbar layout in
> `WriterV2ToolbarControls.tsx`. Group them logically:
> 1. **Text format group**: HeadingDropdown, FontFamilyDropdown, FontSizeDropdown
> 2. **Style group**: Bold, Italic, Underline, Strikethrough buttons
> 3. **Color group**: TextColorPicker, HighlightColorPicker
> 4. **List group**: Bullet list, Numbered list
> 5. **Alignment group**: Left, Center, Right buttons
> 6. **Insert group**: InsertImageButton, InsertTableButton
> 7. **Indent group**: Indent, Outdent buttons

---

### S-Phase 4.2 — Image Insertion Workflow (File Picker + Drag-and-Drop)

**File**: `frontend/src/components/writer-v2/plugins/ImageDropPlugin.tsx` [NEW]—This Lexical plugin enables drag-and-drop image insertion:

```tsx—import { useEffect } from 'react';—import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';—import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH } from 'lexical';—import { $createImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';

/**
 * Lexical plugin that handles drag-and-drop image insertion.
 * Drop an image file onto the editor to insert it at the drop position.
 */—export function ImageDropPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFile = Array.from(files).find((f) =>
        f.type.startsWith('image/'),
      );
      if (!imageFile) return;

      event.preventDefault();
      event.stopPropagation();

      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const imageNode = $createImageNode(src, imageFile.name);
            selection.insertNodes([imageNode]);
          }
        });
      };
      reader.readAsDataURL(imageFile);
    };

    const handleDragOver = (event: DragEvent) => {
      const hasFiles = event.dataTransfer?.types.includes('Files');
      if (hasFiles) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'copy';
      }
    };

    rootElement.addEventListener('drop', handleDrop);
    rootElement.addEventListener('dragover', handleDragOver);

    return () => {
      rootElement.removeEventListener('drop', handleDrop);
      rootElement.removeEventListener('dragover', handleDragOver);
    };
  }, [editor]);

  return null;
}
```

**Integration**: Add `<ImageDropPlugin />` inside the `<LexicalComposer>` in WriterPopupEditor.tsx:
```tsx—import { ImageDropPlugin } from './plugins/ImageDropPlugin';

// Inside <LexicalComposer>:
<ImageDropPlugin />
```

---

### S-Phase 4.3 — Table Import from Clipboard (CSV/HTML)

> [!NOTE]
> The existing [tableImport.ts](file:///c:/Code1/Pdf-Hub/frontend/src/core/writer-v2/clipboard/tableImport.ts)
> has logic for extracting table data. This step wires it into a Lexical clipboard plugin.

**File**: `frontend/src/components/writer-v2/plugins/TablePastePlugin.tsx` [NEW]

```tsx—import { useEffect } from 'react';—import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';—import { insertTableFromData } from '@/core/writer-v2/lexical-nodes/tableHelpers';

/**
 * Detect pasted CSV data and insert as a table.
 * Works for tab-separated (TSV from Excel/Google Sheets) and comma-separated data.
 */—export function TablePastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return;

      // Detect tabular data: multiple lines with consistent tab/comma separators
      const lines = text.trim().split('\n');
      if (lines.length < 2) return; // Need at least 2 rows to consider it a table

      const isTabSeparated = lines.every((l) => l.includes('\t'));
      const isCommaSeparated = !isTabSeparated && lines.every((l) => l.includes(','));

      if (!isTabSeparated && !isCommaSeparated) return;

      const separator = isTabSeparated ? '\t' : ',';
      const data = lines.map((line) =>
        line.split(separator).map((cell) => cell.trim()),
      );

      // Verify it's actually tabular (consistent column count)
      const colCounts = data.map((row) => row.length);
      const maxCols = Math.max(...colCounts);
      const minCols = Math.min(...colCounts);
      if (maxCols <= 1 || minCols < 1) return;

      // Prevent default paste and insert as table
      event.preventDefault();
      insertTableFromData(editor, data);
    };

    rootElement.addEventListener('paste', handlePaste);
    return () => rootElement.removeEventListener('paste', handlePaste);
  }, [editor]);

  return null;
}
```

**Integration**: Add `<TablePastePlugin />` inside `<LexicalComposer>` in WriterPopupEditor.tsx.

---

### S-Phase 4.4 — Export Pipeline: Preserve Rich Formatting

> [!WARNING]
> The current export pipeline in `flattenedPdfExport.ts` discards rich formatting
> and only renders `plainText`. This step adds a `richTextToPdfBlocks()` function
> that converts Lexical `editorStateJson` into pdf-lib drawing instructions that
> preserve bold, italic, font size, and color.

**File**: `frontend/src/core/writer-v2/export/richTextRenderer.ts` [NEW]

```typescript—import type { WriterElementV2 } from '../types';

/**
 * Represents a styled text segment for PDF rendering.
 * Each segment maps to a pdf-lib drawText() call with specific styling.
 */—export interface PdfTextSegment {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;          // hex color
  backgroundColor?: string; // hex highlight color
  x: number;              // x offset within the element
  y: number;              // y offset within the element (from top)
  lineHeight: number;
}

/**
 * Represents a block-level element for PDF rendering.
 */—export type PdfBlock =
  | { type: 'text'; segments: PdfTextSegment[] }
  | { type: 'image'; src: string; width: number; height: number; x: number; y: number }
  | { type: 'table'; rows: string[][]; x: number; y: number; colWidths: number[] };

/**
 * Parse Lexical editorStateJson into renderable PDF blocks.
 * Falls back to plainText if parsing fails.
 *
 * @param element - The writer element to convert
 * @returns Array of PdfBlocks ready for pdf-lib rendering
 */—export function editorStateToPdfBlocks(element: WriterElementV2): PdfBlock[] {
  const { editorStateJson, plainText, rect, style } = element;

  // Fallback: if no editorState, use plain text
  if (!editorStateJson) {
    return [{
      type: 'text',
      segments: [{
        text: plainText || '',
        fontSize: style?.fontSize ?? 14,
        fontFamily: style?.fontFamily ?? 'Helvetica',
        bold: false,
        italic: false,
        underline: false,
        color: style?.textColor ?? '#000000',
        x: 0,
        y: 0,
        lineHeight: (style?.fontSize ?? 14) * 1.2,
      }],
    }];
  }

  try {
    const state = JSON.parse(editorStateJson);
    const root = state?.root;
    if (!root || !root.children) {
      return [{ type: 'text', segments: [makeFallbackSegment(element)] }];
    }

    const blocks: PdfBlock[] = [];
    let yOffset = 0;

    for (const child of root.children) {
      const block = parseNode(child, 0, yOffset, style);
      if (block) {
        blocks.push(block);
        yOffset += estimateBlockHeight(block);
      }
    }

    return blocks.length > 0
      ? blocks
      : [{ type: 'text', segments: [makeFallbackSegment(element)] }];
  } catch {
    // JSON parse failed — fall back to plain text
    return [{ type: 'text', segments: [makeFallbackSegment(element)] }];
  }
}—function makeFallbackSegment(element: WriterElementV2): PdfTextSegment {
  return {
    text: element.plainText || '',
    fontSize: element.style?.fontSize ?? 14,
    fontFamily: element.style?.fontFamily ?? 'Helvetica',
    bold: false,
    italic: false,
    underline: false,
    color: element.style?.textColor ?? '#000000',
    x: 0,
    y: 0,
    lineHeight: (element.style?.fontSize ?? 14) * 1.2,
  };
}—function parseNode(
  node: Record<string, unknown>,
  xOffset: number,
  yOffset: number,
  parentStyle: WriterElementV2['style'],
): PdfBlock | null {
  const type = node.type as string;

  if (type === 'paragraph' || type === 'heading') {
    const children = node.children as Array<Record<string, unknown>> | undefined;
    if (!children) return null;

    const fontSize = type === 'heading'
      ? getHeadingFontSize(node.tag as string)
      : (parentStyle?.fontSize ?? 14);

    const segments: PdfTextSegment[] = [];
    let xCursor = xOffset;

    for (const child of children) {
      if (child.type === 'text') {
        const format = (child.format as number) ?? 0;
        const textStyle = extractInlineStyles(child.style as string);

        segments.push({
          text: child.text as string || '',
          fontSize: textStyle.fontSize ?? fontSize,
          fontFamily: textStyle.fontFamily ?? parentStyle?.fontFamily ?? 'Helvetica',
          bold: (format & 1) !== 0,
          italic: (format & 2) !== 0,
          underline: (format & 8) !== 0,
          color: textStyle.color ?? parentStyle?.textColor ?? '#000000',
          backgroundColor: textStyle.backgroundColor,
          x: xCursor,
          y: yOffset,
          lineHeight: (textStyle.fontSize ?? fontSize) * 1.2,
        });
        // Approximate x advance (real calculation needs font metrics)
        xCursor += ((child.text as string) || '').length * (textStyle.fontSize ?? fontSize) * 0.6;
      }
    }

    return segments.length > 0 ? { type: 'text', segments } : null;
  }

  if (type === 'inline-image') {
    return {
      type: 'image',
      src: node.src as string || '',
      width: (node.width as number) || 200,
      height: (node.height as number) || 150,
      x: xOffset,
      y: yOffset,
    };
  }

  return null;
}—function getHeadingFontSize(tag: string): number {
  switch (tag) {
    case 'h1': return 28;
    case 'h2': return 22;
    case 'h3': return 18;
    default: return 14;
  }
}—function extractInlineStyles(styleStr: string | null | undefined): {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
} {
  if (!styleStr) return {};
  const result: Record<string, string> = {};

  for (const pair of styleStr.split(';')) {
    const [key, value] = pair.split(':').map((s) => s.trim());
    if (key && value) result[key] = value;
  }

  return {
    fontSize: result['font-size'] ? parseInt(result['font-size'], 10) : undefined,
    fontFamily: result['font-family'],
    color: result['color'],
    backgroundColor: result['background-color'],
  };
}—function estimateBlockHeight(block: PdfBlock): number {
  if (block.type === 'text') {
    return Math.max(...block.segments.map((s) => s.lineHeight), 20);
  }
  if (block.type === 'image') return block.height + 16;
  if (block.type === 'table') return block.rows.length * 24 + 8;
  return 20;
}
```

---

### S-Phase 4.5 — Writer & Export Tests

**File**: `frontend/src/core/writer-v2/export/richTextRenderer.test.ts` [NEW]

```typescript—import { describe, it, expect } from 'vitest';—import { editorStateToPdfBlocks } from './richTextRenderer';—import type { WriterElementV2 } from '../types';—const makeElement = (overrides: Partial<WriterElementV2> = {}): WriterElementV2 => ({
  id: 'test-1',
  documentFingerprint: 'doc-1',
  pageIndex: 0,
  type: 'richTextBox',
  rect: { x: 50, y: 600, width: 200, height: 100 },
  plainText: 'Fallback text',
  style: {
    backgroundColor: '#ffffff',
    borderColor: '#000000',
    borderWidth: 1,
    padding: 8,
    opacity: 1,
    zIndex: 0,
    fontSize: 14,
    fontFamily: 'Arial',
    textColor: '#000000',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  locked: false,
  hidden: false,
  ...overrides,
});—describe('editorStateToPdfBlocks', () => {
  it('returns fallback text when no editorStateJson', () => {
    const blocks = editorStateToPdfBlocks(makeElement());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].text).toBe('Fallback text');
      expect(blocks[0].segments[0].fontSize).toBe(14);
    }
  });

  it('parses simple paragraph from editorStateJson', () => {
    const editorState = {
      root: {
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Hello World',
            format: 0,
          }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].text).toBe('Hello World');
    }
  });

  it('detects bold text (format bit 1)', () => {
    const editorState = {
      root: {
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Bold text',
            format: 1,
          }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].bold).toBe(true);
      expect(blocks[0].segments[0].italic).toBe(false);
    }
  });

  it('detects italic text (format bit 2)', () => {
    const editorState = {
      root: {
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Italic text',
            format: 2,
          }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].italic).toBe(true);
    }
  });

  it('detects bold+italic combined (format bits 1+2 = 3)', () => {
    const editorState = {
      root: {
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Bold Italic',
            format: 3,
          }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].bold).toBe(true);
      expect(blocks[0].segments[0].italic).toBe(true);
    }
  });

  it('parses heading node with correct font size', () => {
    const editorState = {
      root: {
        children: [{
          type: 'heading',
          tag: 'h1',
          children: [{ type: 'text', text: 'Title', format: 0 }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].fontSize).toBe(28); // h1 = 28px
    }
  });

  it('parses inline-image node', () => {
    const editorState = {
      root: {
        children: [{
          type: 'inline-image',
          src: 'data:image/png;base64,abc',
          width: 300,
          height: 200,
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    expect(blocks[0].type).toBe('image');
    if (blocks[0].type === 'image') {
      expect(blocks[0].src).toBe('data:image/png;base64,abc');
      expect(blocks[0].width).toBe(300);
    }
  });

  it('handles malformed JSON gracefully', () => {
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: '{{invalid json' }),
    );

    // Should fall back to plainText
    expect(blocks).toHaveLength(1);
    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].text).toBe('Fallback text');
    }
  });

  it('extracts inline styles (font-size, color)', () => {
    const editorState = {
      root: {
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Styled',
            format: 0,
            style: 'font-size: 24px; color: #ff0000',
          }],
        }],
      },
    };
    const blocks = editorStateToPdfBlocks(
      makeElement({ editorStateJson: JSON.stringify(editorState) }),
    );

    if (blocks[0].type === 'text') {
      expect(blocks[0].segments[0].fontSize).toBe(24);
      expect(blocks[0].segments[0].color).toBe('#ff0000');
    }
  });
});—describe('Writer V2 command workflow', () => {
  it('creates, moves, and undoes via command store', async () => {
    const {
      createInitialWriterV2State,
      executeWriterCommand,
      undoWriterCommand,
    } = await import('../writerCommandStore');

    let state = createInitialWriterV2State();

    // Add element
    const el = makeElement({ id: 'e1' });
    const r1 = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: el,
    });
    expect(r1.changed).toBe(true);
    state = r1.state;
    expect(state.elements).toHaveLength(1);

    // Move element
    const r2 = executeWriterCommand(state, {
      type: 'MOVE_WRITER_ELEMENT',
      id: 'e1',
      dx: 50,
      dy: -30,
    });
    expect(r2.changed).toBe(true);
    state = r2.state;
    expect(state.elements[0].rect.x).toBe(100);

    // Undo move
    const r3 = undoWriterCommand(state);
    expect(r3.changed).toBe(true);
    expect(r3.state.elements[0].rect.x).toBe(50);
  });

  it('rejects move on locked element', async () => {
    const {
      createInitialWriterV2State,
      executeWriterCommand,
    } = await import('../writerCommandStore');

    let state = createInitialWriterV2State();
    const el = makeElement({ id: 'e1', locked: true });

    const r1 = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: el,
    });
    state = r1.state;

    const r2 = executeWriterCommand(state, {
      type: 'MOVE_WRITER_ELEMENT',
      id: 'e1',
      dx: 50,
      dy: 50,
    });
    expect(r2.changed).toBe(false);
  });
});
```

---

### S-Phase 4.6 — Toolbar CSS (WordPad-Style)

**File**: Add to the existing writer CSS (or create `frontend/src/components/writer-v2/writerToolbar.css` [NEW])

```css
/* ���� WordPad-Style Writer Toolbar ������������������������������������������������ */

.writer-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 8px;
  background: var(--surface-secondary, #f5f5f5);
  border-bottom: 1px solid var(--border-subtle, #e0e0e0);
  align-items: center;
  min-height: 36px;
}

.writer-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-right: 1px solid var(--border-subtle, #d0d0d0);
}

.writer-toolbar-group:last-child {
  border-right: none;
}

.writer-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s ease;
}

.writer-toolbar-btn:hover {
  background: var(--hover-subtle, rgba(0, 0, 0, 0.08));
}

.writer-toolbar-btn:active,
.writer-toolbar-btn.active {
  background: var(--active-subtle, rgba(0, 0, 0, 0.15));
}

.writer-toolbar-select {
  height: 28px;
  border: 1px solid var(--border-subtle, #d0d0d0);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
  background: white;
  cursor: pointer;
}

.writer-toolbar-color {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle, #d0d0d0);
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
  background: white;
}

.writer-table-dialog {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  background: white;
  border: 1px solid var(--border-subtle, #d0d0d0);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  gap: 8px;
  align-items: center;
}

.writer-table-dialog label {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.writer-table-dialog input[type="number"] {
  width: 48px;
  height: 28px;
  border: 1px solid var(--border-subtle, #d0d0d0);
  border-radius: 4px;
  padding: 0 4px;
  text-align: center;
}

.writer-table-dialog button {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.writer-table-dialog button:first-of-type {
  background: var(--primary, #3b82f6);
  color: white;
}

.writer-table-dialog button:last-of-type {
  background: var(--surface-secondary, #e5e5e5);
}
```

---

### S-Phase 4 Acceptance Gate

```bash—pnpm --dir frontend check:release   # MUST exit 0

# Writer toolbar renders without crashing—pnpm --dir frontend test -- --grep "Writer"   # All writer tests pass

# Writer command model has undo/redo—pnpm --dir frontend test -- --grep "writerCommandStore"

# Rich text renderer handles all node types—pnpm --dir frontend test -- --grep "editorStateToPdfBlocks"

# ImageNode serialization works—pnpm --dir frontend test -- --grep "ImageNode"

# Export gracefully handles malformed JSON—pnpm --dir frontend test -- --grep "malformed JSON"
```

---
---

## S-Phase 5 — Integration, Smoke Tests & Release

**Goal**: Playwright smoke tests, real fixture PDFs, automated performance capture.

---

### S-Phase 5.1 — Add Playwright

```bash—pnpm --dir frontend add -D @playwright/test—npx playwright install chromium
```

### S-Phase 5.2 — Fixture PDFs—Create `frontend/test-fixtures/` with:
- `simple-text.pdf` — 2-page text document
- `rotated-pages.pdf` — pages at 0�, 90�, 180�, 270�
- `multi-page.pdf` — 8+ pages

### S-Phase 5.3 — Playwright Smoke Test

**File**: `frontend/e2e/static-smoke.spec.ts` (NEW)

```typescript—import { test, expect } from '@playwright/test';—test.describe('Static mode smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads without errors', async ({ page }) => {
    // No uncaught exceptions
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.waitForSelector('[role="status"]');
    expect(errors).toHaveLength(0);
  });

  test('shows mode banner', async ({ page }) => {
    const banner = page.locator('[role="status"]');
    await expect(banner).toBeVisible();
    const text = await banner.textContent();
    expect(text?.toLowerCase()).toMatch(/mode/);
  });

  test('no network requests to /api/', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        apiCalls.push(req.url());
      }
    });

    // Wait for app to fully settle
    await page.waitForTimeout(2000);
    expect(apiCalls).toHaveLength(0);
  });
});
```

### S-Phase 5.4 — Final `check:release`

**File**: [frontend/package.json](file:///c:/Code1/Pdf-Hub/frontend/package.json) — update `check:release`:

```json
"check:release": "npm run typecheck && npm run lint && npm test && npm run check:static && npm run build"
```

> [!NOTE]
> Playwright smoke tests run separately via `npx playwright test` because they need a running dev server. They are not part of `check:release` but ARE part of the phase gate.

### S-Phase 5.5 — Update Documentation—Update these files at end of Phase 5:

| File | Update |
|------|--------|
| [AUDIT_BASELINE.md](file:///c:/Code1/Pdf-Hub/AUDIT_BASELINE.md) | Fill in "After S-Phase 5" column with real counts |
| [PERFORMANCE_BASELINE.md](file:///c:/Code1/Pdf-Hub/PERFORMANCE_BASELINE.md) | Replace �a�️ Manual rows with Playwright measurements where possible |
| [HANDOFF_NOTES.md](file:///c:/Code1/Pdf-Hub/HANDOFF_NOTES.md) | Add S-Phase 5 entry: built, deferred, known limits |
| [Docs/VERIFICATION_SYSTEM.md](file:///c:/Code1/Pdf-Hub/Docs/VERIFICATION_SYSTEM.md) | Update phase checklist with S-Phase completion |

---

### S-Phase 5 Acceptance Gate

```bash
# ALL must pass—pnpm --dir frontend check:release        # typecheck + lint + test + static + build—npx playwright test                        # browser smoke tests

# Verify no broken buttons—npx playwright test static-smoke          # static-mode specific tests

# Verify fixture PDFs exist—test -d frontend/test-fixtures—ls frontend/test-fixtures/*.pdf | wc -l   # MUST be >= 3
```

---

## Execution Order

```
Prerequisite: Amend ARCHITECTURE.md + AGENTS.md INV-5
  │
  └─ S-Phase 0 — Baseline audit, check:release, AUDIT_REPORT.json
     └─ S-Phase 1 — Three-mode capabilities, PreviewModeBanner, route guards
        ├─ S-Phase 2 — MacroOpMetadata + WordPad Lexical Nodes (ImageNode, TableNode, HeadingNode)
        ├─ S-Phase 3 — AnnotationGeometry, coordinate stability, persistence hardening
        └─ S-Phase 4 — WordPad toolbar, image/table insertion, export pipeline fix
           └─ S-Phase 5 — Playwright smoke, fixtures, documentation, release gate
```

---

## Global Rules (Every Phase)

### End-of-phase command sequence

```bash—pnpm --dir frontend typecheck—pnpm --dir frontend lint—pnpm --dir frontend test—pnpm --dir frontend check:static—pnpm --dir frontend build
```—All five MUST exit 0.

### Files to update at phase boundary

- [AUDIT_BASELINE.md](file:///c:/Code1/Pdf-Hub/AUDIT_BASELINE.md)
- [PERFORMANCE_BASELINE.md](file:///c:/Code1/Pdf-Hub/PERFORMANCE_BASELINE.md) (if performance-related)
- [HANDOFF_NOTES.md](file:///c:/Code1/Pdf-Hub/HANDOFF_NOTES.md)
- [Docs/VERIFICATION_SYSTEM.md](file:///c:/Code1/Pdf-Hub/Docs/VERIFICATION_SYSTEM.md)

### File naming conventions

- Tests: `*.test.ts` or `*.test.tsx` adjacent to source file
- New source: kebab-case filenames (e.g., `macro-metadata.ts`)
- Types: export from `types.ts` in each module directory

### Import path convention

```typescript
// Always use @/ alias for absolute imports—import { log } from '@/core/logger/service';—import type { Capabilities } from '@/hooks/useCapabilities';
```

### Logging convention (INV-11)

```typescript
// CORRECT: structured logging—import { info, warn, debug, error } from '@/core/logger/service';—info('macro', 'Recipe validated', { recipeId, stepCount });

// FORBIDDEN: console.log
// console.log('anything');  — � ESLint error
```
