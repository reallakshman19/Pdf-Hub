# Phase 4 — Type Safety + CI Contracts

**Depends on:** Phase 2 and Phase 3 complete  
**Estimated effort:** ~1.5 hours

---

## WI-4.1 — Undo History Policy Module + Capped Stack

**Create:** `frontend/src/core/document-history/historyPolicy.ts`

```typescript
/**
 * Document history policy constants.
 * All undo/redo behaviour is governed by this file.
 * Do not hardcode these values elsewhere.
 */
export const HISTORY_POLICY = {
  /**
   * Maximum number of undo steps retained in memory.
   * Each step stores before + after full PDF bytes.
   * At 25 MB per PDF: 15 steps × 2 × 25 MB = 750 MB worst case.
   * For larger PDFs, consider IndexedDB offloading in a future phase.
   */
  maxUndoDepth: 15,

  /**
   * Documents above this size (bytes) are candidates for off-heap history.
   * Currently informational — used for telemetry only.
   */
  largeDocumentThresholdBytes: 25 * 1024 * 1024,

  /**
   * History storage strategy.
   * 'full-snapshot-capped' = full before/after bytes, capped at maxUndoDepth.
   * Future: 'diff' = store binary diffs, unlimited depth.
   */
  strategy: 'full-snapshot-capped' as const,
} as const;
```

**Update `document-history/store.ts`** — import the policy, remove the hardcoded magic number:

```typescript
// frontend/src/core/document-history/store.ts
import { HISTORY_POLICY } from './historyPolicy';

// In push action:
push: (transaction) =>
  set((state) => ({
    // Trim oldest entries when depth exceeds policy max
    undoStack: [
      ...state.undoStack,
      transaction,
    ].slice(-HISTORY_POLICY.maxUndoDepth),
    redoStack: [],
  })),
```

**Pass gate:**
```bash
# Only historyPolicy.ts may contain the number 15 in this context
grep -rn "maxUndoDepth\|slice(-15)" frontend/src/core/document-history/store.ts
# → should reference HISTORY_POLICY.maxUndoDepth, not literal 15
```

---

## WI-4.2 — Static Contract Check Script

**Create:** `frontend/scripts/static-contract-checks.mjs`

```javascript
#!/usr/bin/env node
/**
 * Static contract checks for DocCraft.
 * Run: node scripts/static-contract-checks.mjs
 * Exits with code 1 if any check fails.
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

let failCount = 0;

function check(name, pattern, dir, expectedMax, flags = 'rn') {
  const searchDir = dir ? path.join(srcDir, dir) : srcDir;
  try {
    const result = execSync(
      `grep -${flags} --include="*.ts" --include="*.tsx" -E "${pattern}" "${searchDir}" 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
    const matches = result.trim().split('\n').filter(Boolean);
    const count = matches.length;
    const status = count <= expectedMax ? '✅ PASS' : '❌ FAIL';
    const detail = count > expectedMax ? `\n   Found: ${matches.slice(0, 5).join('\n   ')}` : '';
    console.log(`${status}  [${name}] count=${count}, max=${expectedMax}${detail}`);
    if (count > expectedMax) failCount++;
  } catch {
    console.log(`⚠️  SKIP  [${name}] (grep error — check pattern)`);
  }
}

console.log('\n🔍 DocCraft Static Contract Checks\n');

check('single createRoot',
  'createRoot\\(',
  null,
  1
);

check('no conflict markers',
  '(<<<<<<<|=======|>>>>>>>)',
  null,
  0
);

check('no toolbar as-any casts',
  'as any',
  'components/toolbar',
  0
);

check('no Konva imports in core domain',
  "from ['\"]konva['\"]",
  'core',
  0
);

check('no console.log in source',
  'console\\.log\\(',
  null,
  0
);

check('no localStorage for annotations',
  "localStorage\\.setItem.*annot",
  null,
  0
);

check('no stale shape/freehand tool names',
  "'shape'|'freehand'",
  'components',
  0
);

console.log(`\n${failCount === 0 ? '✅ All checks passed' : `❌ ${failCount} check(s) failed`}\n`);
process.exit(failCount > 0 ? 1 : 0);
```

**Add to `frontend/package.json` scripts:**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "check:static": "node scripts/static-contract-checks.mjs",
    "check:all": "npm run typecheck && npm test && npm run check:static"
  }
}
```

**Pass gate:**
```bash
npm run check:static  # → exit code 0, all checks ✅ PASS
```

---

## WI-4.3 — Load IBM Plex Sans Font

**File:** `frontend/index.html`

Add inside `<head>`, before the title tag:

```html
<!-- IBM Plex Sans — matches --font-sans in themes.css -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
  rel="stylesheet"
>
```

**Pass gate:** Open browser DevTools → Computed styles on `body` → `font-family` starts with `"IBM Plex Sans"`, not system fallback.

---

## WI-4.4 — Remove Vite Boilerplate from App.css

**File:** `frontend/src/App.css`

Delete all scaffold content (`.hero`, `.counter`, `#center`, `#next-steps`, etc.). Replace with a single comment:

```css
/* App.css — Reserved for app-level layout overrides.
   Component styles live in their respective component files.
   Design tokens live in styles/themes.css.
*/
```

**Pass gate:**
```bash
# File exists but is nearly empty
wc -l frontend/src/App.css   # → ≤ 5 lines
```

---

## WI-4.5 — Clean Up Stale Type Aliases After Phase 2

After Phase 2 migrates `ActiveTool` to use `AnnotationType`, verify no runtime code still references the removed `'shape'` or `'freehand'` string literals.

**Run:**
```bash
grep -rn "'shape'\|'freehand'" frontend/src --include="*.ts" --include="*.tsx"
```

For each result found:
- If it is in a **test file** checking migration: leave it with a comment explaining it's a compatibility test
- If it is in **runtime UI or store code**: replace with the correct specific tool name (`'shape-rect'`, `'ink'`, etc.)

**Pass gate:**
```bash
# 0 results in runtime source (tests excepted)
grep -rn "'shape'\|'freehand'" frontend/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." | grep -v "spec\." | wc -l   # → 0
```

---

## WI-4.6 — Fix Mixed Line Endings

**Create:** `.gitattributes` in repo root:

```gitattributes
# Normalize line endings on commit
*           text=auto eol=lf
*.ts        text eol=lf
*.tsx       text eol=lf
*.css       text eol=lf
*.json      text eol=lf
*.md        text eol=lf
*.html      text eol=lf

# Binaries — no conversion
*.woff2     binary
*.woff      binary
*.ttf       binary
*.eot       binary
*.png       binary
*.jpg       binary
*.jpeg      binary
*.gif       binary
*.ico       binary
*.pdf       binary
*.webp      binary
```

Then renormalize existing files:
```bash
git add --renormalize .
git commit -m "chore: normalize line endings to LF"
```

**Pass gate:**
```powershell
# Check specific known-CRLF files after renormalize
(Get-Content "frontend/src/adapters/pdf-edit/PdfEditAdapter.ts" -Raw) -match "`r`n"
# → False (no CRLF)
```

---

## Phase 4 Completion Checklist

```
□ historyPolicy.ts created with maxUndoDepth = 15
□ document-history/store.ts uses HISTORY_POLICY.maxUndoDepth (not literal 15)
□ static-contract-checks.mjs created and executable
□ npm run check:static passes (exit code 0)
□ npm run typecheck script added to frontend/package.json
□ IBM Plex Sans loads — verified in DevTools computed styles
□ App.css emptied of Vite scaffold content
□ 'shape' and 'freehand' literals absent from runtime code (0 grep results)
□ .gitattributes created, files renormalized to LF
□ npm run check:all passes end-to-end
```
