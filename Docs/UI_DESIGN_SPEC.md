# DocCraft — UI Design Specification

> Zone-by-zone layout, component inventory, and phase-tagged placeholders.
> Every placeholder has a `data-testid`, a phase tag, and a visual spec.

---

## Design Language

**Aesthetic:** Industrial-precision, dark-by-default, high-information-density.
Think professional creative tools (Figma, VSCode, Adobe XD) — not consumer apps.

**Color system:**
```css
:root {
  /* Surfaces */
  --surface-base:    #0f1117;   /* app background */
  --surface-raised:  #181c26;   /* panels, sidebars */
  --surface-overlay: #1e2333;   /* toolbar, nav */
  --surface-hover:   #252b3b;   /* hover state */
  --surface-active:  #2d3448;   /* selected/active */
  --surface-border:  #2e3450;   /* dividers, borders */

  /* Brand */
  --accent-primary:  #4f8ef7;   /* buttons, links, focus */
  --accent-hover:    #6ba3ff;
  --accent-success:  #34d399;
  --accent-warning:  #fbbf24;
  --accent-danger:   #f87171;

  /* Text */
  --text-primary:    #e8eaf2;
  --text-secondary:  #8b92a8;
  --text-muted:      #4f566b;
  --text-accent:     #4f8ef7;

  /* Mode badges */
  --badge-static:  #fbbf24;    /* amber */
  --badge-server:  #34d399;    /* green */

  /* Fonts */
  --font-ui:   'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'Fira Code', monospace;
}
```

**Typography:**
- UI labels: IBM Plex Sans 12–14px, weight 400–500
- Headings: IBM Plex Sans 16–22px, weight 600
- Code/debug: IBM Plex Mono 12px
- Never Inter, never Roboto, never system-ui alone

---

## Layout Grid

```
┌──────────────────────────────────────────────────────────────────────┐
│ ZONE S1 — TopNav                                          48px h     │
├───────────────────────────────────────────────────────────────────────┤
│ ZONE S2 — Toolbar Band                                    40px h     │
├──────┬──────────────────────────────────────────┬─────────────────────┤
│  S3  │  ZONE S4       │  ZONE S5               │  ZONE S6           │
│ Left │  Left Sidebar  │  Document Workspace    │  Inspector         │
│ Rail │  240–360px     │  flex: 1               │  280–400px         │
│ 48px │  (resizable)   │  (scrollable)          │  (resizable)       │
│      │                │                        │                    │
│      │                │                        │                    │
│      │                │                        │                    │
├──────┴──────────────────────────────────────────┴─────────────────────┤
│ ZONE S7 — Status Bar                                      28px h     │
├──────────────────────────────────────────────────────────────────────┤
│ ZONE S8 — Debug Console Dock                       0–400px h        │
│ (collapsed by default, toggle Ctrl+Shift+D)                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Zone S1 — Top Navigation

**Height:** 48px
**Background:** `--surface-overlay`
**Border-bottom:** 1px `--surface-border`

```
┌─────────────────────────────────────────────────────────────────────┐
│ [⬡ DocCraft] [SERVER ▼]  Workspace  Macro Console  [    Search   ] [?] [⚙] [🌙] [≡]│
└─────────────────────────────────────────────────────────────────────┘
```

### Components

| Element           | testid                | Phase | State behavior                                      |
|-------------------|-----------------------|-------|-----------------------------------------------------|
| App logo + name   | `app-logo`            | P1    | Static logo                                         |
| Mode badge        | `mode-badge`          | P0    | "STATIC" amber / "SERVER" green                     |
| Nav: Workspace    | `nav-workspace`       | P1    | Active underline on current page                    |
| Nav: Macro Console| `nav-macro-console`   | P5    | Hidden in static mode (capability-gated)            |
| Search input      | `global-search`       | P1    | Placeholder "Search document..." (P2 behavior)      |
| Keyboard help     | `keyboard-help-btn`   | P1    | Opens shortcut modal                                |
| Settings          | `settings-btn`        | P1    | Opens settings panel (P1: stub)                     |
| Theme toggle      | `theme-toggle`        | P1    | Light/dark toggle, persists to localStorage         |
| Debug toggle      | `debug-toggle-btn`    | P0    | Ctrl+Shift+D, toggles S8                            |

---

## Zone S2 — Toolbar Band

**Height:** 40px
**Background:** `--surface-overlay`
**Border-bottom:** 1px `--surface-border`

```
┌───────────────────────────────────────────────────────────────────────┐
│ FILE │ Open · Save · Export ║ ORGANIZE │ Merge · Split · Insert · Delete ║ COMMENT │ TextBox · Highlight · Stamp · Shape · Draw ║ OCR │ Run OCR · Results ║ VIEW │ Zoom · Fit · Rotate │
└───────────────────────────────────────────────────────────────────────┘
```

### Toolbar Groups

#### Group: File
| Button        | testid                    | Phase | Server-only | Behavior                       |
|---------------|---------------------------|-------|-------------|--------------------------------|
| Open          | `toolbar-btn-open`        | P2    | No          | Opens file picker              |
| Save          | `toolbar-btn-save`        | P3    | No          | Saves annotation JSON          |
| Export        | `toolbar-btn-export`      | P5    | No          | Export flattened PDF           |
| Download      | `toolbar-btn-download`    | P2    | No          | Downloads current PDF          |

#### Group: Organize
| Button        | testid                        | Phase | Server-only | Behavior                         |
|---------------|-------------------------------|-------|-------------|----------------------------------|
| Merge         | `toolbar-btn-merge`           | P2    | No          | Opens merge dialog               |
| Split         | `toolbar-btn-split`           | P2    | No          | Opens split dialog               |
| Insert Page   | `toolbar-btn-insert-page`     | P2    | No          | Insert before/after current page |
| Delete Page   | `toolbar-btn-delete-page`     | P2    | No          | Deletes selected page(s)         |
| Rotate        | `toolbar-btn-rotate`          | P2    | No          | Rotates current page ±90°        |

#### Group: Comment
| Button        | testid                        | Phase | Server-only | Behavior                         |
|---------------|-------------------------------|-------|-------------|----------------------------------|
| Text Box      | `toolbar-btn-textbox`         | P3    | No          | Activates text tool              |
| Highlight     | `toolbar-btn-highlight`       | P3    | No          | Activates highlight tool         |
| Underline     | `toolbar-btn-underline`       | P3    | No          | Activates underline tool         |
| Stamp         | `toolbar-btn-stamp`           | P3    | No          | Opens stamp picker               |
| Shape         | `toolbar-btn-shape`           | P3    | No          | Opens shape submenu              |
| Freehand      | `toolbar-btn-freehand`        | P3    | No          | Activates pencil tool            |
| Comment Pin   | `toolbar-btn-comment`         | P3    | No          | Activates comment pin tool       |
| Form Fill     | `toolbar-btn-formfill`        | P6    | No          | Capability-gated to P6           |

#### Group: OCR
| Button           | testid                     | Phase | Server-only | Behavior                        |
|------------------|----------------------------|-------|-------------|----------------------------------|
| Run OCR          | `toolbar-btn-ocr`          | P4    | No          | Runs Tesseract.js (static mode)  |
| Run Server OCR   | `toolbar-btn-server-ocr`   | P4    | Yes         | Runs server pipeline             |
| View Results     | `toolbar-btn-ocr-results`  | P4    | No          | Opens OCR jobs panel             |

#### Group: View
| Button        | testid                        | Phase | Behavior                            |
|---------------|-------------------------------|-------|-------------------------------------|
| Zoom in       | `zoom-in-btn`                 | P2    | +25% per click, max 400%            |
| Zoom out      | `zoom-out-btn`                | P2    | -25% per click, min 25%             |
| Fit to width  | `zoom-fit-width-btn`          | P2    | Fits page width to workspace        |
| Fit to page   | `zoom-fit-page-btn`           | P2    | Fits full page in workspace         |
| Actual size   | `zoom-actual-btn`             | P2    | Resets to 100%                      |
| Two-page view | `view-two-page-btn`           | P2    | Side-by-side pages                  |
| Compare view  | `view-compare-btn`            | P7    | Capability-gated to P7              |

---

## Zone S3 — Left Rail

**Width:** 48px
**Background:** `--surface-raised`
**Border-right:** 1px `--surface-border`

```
┌──────┐
│  📄  │  Pages (thumbnails)
│  🔖  │  Bookmarks
│  💬  │  Comments
│  🔍  │  Search
│  📊  │  OCR Jobs
└──────┘
```

### Rail Items

| Item       | testid                  | Phase | Sidebar tab activated |
|------------|-------------------------|-------|-----------------------|
| Pages      | `rail-item-pages`       | P1    | `thumbnail`           |
| Bookmarks  | `rail-item-bookmarks`   | P1    | `bookmarks`           |
| Comments   | `rail-item-comments`    | P3    | `comments`            |
| Search     | `rail-item-search`      | P2    | `search`              |
| OCR Jobs   | `rail-item-ocr`         | P4    | `ocr-jobs`            |

---

## Zone S4 — Left Sidebar Panel

**Width:** 240px default, range 160–400px, resizable via drag handle
**Background:** `--surface-raised`
**Border-right:** 1px `--surface-border`

### Tab: Thumbnails `[P1 shell → P2 behavior]`
```
┌─────────────────────┐
│ Pages  (5)          │
├─────────────────────┤
│ [Thumbnail 1] ← active (highlighted border)
│ [Thumbnail 2]
│ [Thumbnail 3]
│ [Thumbnail 4]
│ [Thumbnail 5]
└─────────────────────┘
```
- testid: `sidebar-tab-thumbnails`
- P1: Shows placeholder grid with page numbers and "loading..." text
- P2: Real thumbnails from PdfRendererAdapter.getThumbnail()
- Click → scrolls workspace to that page

### Tab: Bookmarks `[P1 shell → P2 behavior]`
- testid: `sidebar-tab-bookmarks`
- P1: "No bookmarks" empty state
- P2: PDF outline tree, collapsible, click to navigate

### Tab: Comments `[P1 shell → P3 behavior]`
- testid: `sidebar-tab-comments`
- P1: "No comments" empty state with add-comment prompt
- P3: List of comment annotations, sorted by page then position
- Click → navigate to annotation + highlight it

### Tab: Search `[P1 shell → P2 behavior]`
- testid: `sidebar-tab-search`
- P1: Search input (no behavior), empty results list
- P2: Full-text search in native PDF text
- P4: Also searches OCR text index
- Results show: page number, surrounding text excerpt, highlight count

### Tab: OCR Jobs `[P1 shell → P4 behavior]`
- testid: `sidebar-tab-ocr-jobs`
- P1: "No OCR jobs" empty state
- P4: List of jobs with status, progress bars, cancel buttons

---

## Zone S5 — Document Workspace

**Background:** `--surface-base`
**Flex:** 1 (takes all remaining width)
**Overflow:** auto (scrollable)

### Layer stack (z-index order, bottom to top)

```
z:1  Canvas layer    (PDF.js rendered pages)
z:2  Text layer      (invisible spans for selection)
z:3  Equation layer  (MathJax SVG overlays)
z:4  Annotation layer (Fabric.js canvas)
z:5  Selection UI   (resize handles, etc.)
```

### States

#### State: No document (P1)
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│          [⬡ DocCraft icon - large, centered]            │
│                                                         │
│         Open a PDF to begin                             │
│                                                         │
│     [Open File]   or drag a PDF here                    │
│                                                         │
│     Recent:  report.pdf  ·  thesis.pdf  ·  scan.pdf    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
- testid: `workspace-empty-state`
- Drag-and-drop zone visible with dashed border on hover
- Recent files from localStorage

#### State: Document open (P2)
```
┌─────────────────────────────────────────────────────────┐
│  [page 1 canvas - full width at current zoom]           │
│                                                         │
│  [page 2 canvas]                                        │
│                                                         │
│  [page N canvas]                                        │
└─────────────────────────────────────────────────────────┘
```
- Each page: `data-testid="page-canvas-{n}"`
- Annotation overlay: `data-testid="annotation-overlay-{n}"`
- Equation overlay: `data-testid="equation-overlay-{n}"`
- Inter-page gap: 16px
- Page shadow: subtle `box-shadow: 0 2px 12px rgba(0,0,0,0.4)`

---

## Zone S6 — Inspector Panel

**Width:** 280px default, range 200–480px, resizable via drag handle
**Background:** `--surface-raised`
**Border-left:** 1px `--surface-border`

### Tabs

| Tab        | testid                    | Phase | Content                                         |
|------------|---------------------------|-------|-------------------------------------------------|
| Properties | `inspector-tab-properties`| P1    | P1: stub; P3: annotation properties             |
| Style      | `inspector-tab-style`     | P1    | P1: stub; P3: font/color/stroke controls        |
| Metadata   | `inspector-tab-metadata`  | P2    | P2: PDF metadata (title, author, pages, size)   |
| Actions    | (no tab, bottom section)  | P3    | Delete selection, duplicate, align               |

#### Properties tab — annotation selected (P3)

```
┌─────────────────────────────────┐
│ Text Box                        │
│ ─────────────────────────────── │
│ Page      1                     │
│ Position  x: 100  y: 150        │
│ Size      w: 200  h: 40         │
│ Created   15 Jan 2024 10:05     │
│ ─────────────────────────────── │
│ STYLE                           │
│ Font      Helvetica  12px       │
│ Color     [■ #1a1a1a]           │
│ Bg Color  [■ #fff9c4]           │
│ Opacity   ████████░░  80%       │
│ ─────────────────────────────── │
│ [Delete]          [Duplicate]   │
└─────────────────────────────────┘
```

---

## Zone S7 — Status Bar

**Height:** 28px
**Background:** `--surface-overlay`
**Border-top:** 1px `--surface-border`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Page 1 / 5  │  Zoom: 100%  [─────●───────]  │  ● SERVER  │  Saved  │
└─────────────────────────────────────────────────────────────────────┘
```

| Element        | testid                    | Phase | Content                                        |
|----------------|---------------------------|-------|------------------------------------------------|
| Page info      | `status-page-info`        | P1    | "— / —" → P2: "Page 1 / 5"                    |
| Zoom label     | `zoom-level-label`        | P2    | "100%"                                         |
| Zoom slider    | `zoom-slider`             | P2    | Range 25–400                                   |
| Mode badge     | `status-mode-badge`       | P0    | STATIC / SERVER                                |
| Save indicator | `status-save-indicator`   | P3    | "Saved" / "● Unsaved changes"                  |
| OCR status     | `status-ocr-indicator`    | P4    | Hidden unless OCR running: "OCR: 12/50 pages"  |

---

## Zone S8 — Debug Console Dock

**Default height:** 0 (hidden)
**Open height:** 260px default, drag-resizable to 60% viewport height
**Background:** `--surface-raised`
**Border-top:** 2px `--accent-primary` (distinctive — this is a developer tool)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▲  Logs [23]  │  State  │  Performance  │  System     [Clear] [↓]  [✕]│
├─────────────────────────────────────────────────────────────────────┤
│ Filter: [All ▼] [All Sources ▼] [Search...                        ] │
├─────────────────────────────────────────────────────────────────────┤
│ 10:05:00  INFO  system       App startup          mode: static      │
│ 10:05:01  INFO  capabilities Mode detection       serverAlive: false│
│ 10:05:12  INFO  session      File opened          test.pdf 5 pages  │
│ 10:05:12  DEBUG pdf-renderer Page rendered        page: 1  142ms    │
│ 10:05:12  DEBUG pdf-renderer Page rendered        page: 2  98ms     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tabs

| Tab         | testid                     | Phase | Content                                              |
|-------------|----------------------------|-------|------------------------------------------------------|
| Logs        | `debug-tab-logs`           | P0    | Filterable log list, virtualized, colored by level   |
| State       | `debug-tab-state`          | P0    | Live JSON of all Zustand stores, auto-refresh 1s     |
| Performance | `debug-tab-performance`    | P2    | Render times table, last 20 timed operations         |
| System      | `debug-tab-system`         | P0    | Mode, browser, screen, memory, server version        |

#### Log row color coding

| Level   | Row color              | Label color         |
|---------|------------------------|---------------------|
| debug   | default                | `--text-muted`      |
| info    | default                | `--text-secondary`  |
| warn    | `rgba(251,191,36,0.08)`| `--accent-warning`  |
| error   | `rgba(248,113,113,0.1)`| `--accent-danger`   |

---

## Component Inventory by Phase

### Phase 0 — Available from day 1
- `ModeDetector` (invisible, runs on mount)
- `LogService` (global singleton)
- `DebugConsoleDock` (shell + Logs tab + System tab)
- `ModeBadge` (used in TopNav and StatusBar)

### Phase 1 — App shell complete
- `AppShell` ← mounts all zones
- `TopNav` ← all nav elements, stubs for non-P1 behavior
- `ToolbarBand` ← all 5 groups with placeholder buttons
- `LeftRail` ← 5 icons with tooltips
- `SidebarPanel` ← 5 tabs with "coming in Phase N" placeholders
- `DocumentWorkspace` ← empty state with drop zone
- `InspectorPanel` ← 3 tabs with stubs
- `StatusBar` ← layout complete, P0 data (mode badge)

### Phase 2 — PDF Viewer fills in
- `PdfViewer` ← replaces workspace empty state
- `PageCanvas` ← one per page
- `TextLayer` ← per page
- `ThumbnailPanel` ← real thumbnails
- `BookmarksPanel` ← real PDF outline
- `SearchPanel` ← full-text search active
- `MetadataTab` ← PDF metadata in inspector
- StatusBar page info and zoom controls active

### Phase 3 — Annotation tools fill in
- `AnnotationOverlay` ← per page, Fabric.js canvas
- `TextBoxTool`, `HighlightTool`, `UnderlineTool`, `StampTool`
- `ShapeTool`, `FreehandTool`, `CommentTool`
- `CommentsPanel` ← real annotation list
- `PropertiesTab`, `StyleTab` ← live inspector

### Phase 4 — OCR fills in
- `OcrLauncher` ← in toolbar
- `OcrProgress` ← in OCR jobs panel
- `OcrResultOverlay` ← text/equation overlays per page
- `EquationOverlay` ← MathJax SVG per equation
- `OcrJobsPanel` ← real job list with status
- Status bar OCR progress indicator active

### Phase 5 — Macro fills in
- `MacroConsolePage` ← new page (server mode only)
- Export functions active in toolbar

### Phase 6+
- `FormFillTool`
- `SignatureTool`
- `RedactionTool`
- `CompareView`

---

## Placeholder Component Pattern

Every Phase N+1 feature uses this consistent placeholder:

```typescript
// components/ui/FeaturePlaceholder.tsx
interface FeaturePlaceholderProps {
  icon: React.ReactNode
  title: string
  phase: number
  description?: string
}

export function FeaturePlaceholder({ icon, title, phase, description }: FeaturePlaceholderProps) {
  return (
    <div
      data-placeholder="true"
      data-available-phase={phase}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 12,
        color: 'var(--text-muted)', padding: 24,
      }}
    >
      <div style={{ fontSize: 32, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.6 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, textAlign: 'center', opacity: 0.4, maxWidth: 200 }}>
          {description}
        </div>
      )}
      <div style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 4,
        background: 'var(--surface-active)', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        Available in Phase {phase}
      </div>
    </div>
  )
}
```

---

## Keyboard Shortcuts

| Shortcut             | Action                         | Phase |
|----------------------|--------------------------------|-------|
| `Ctrl+O`             | Open file                      | P2    |
| `Ctrl+S`             | Save annotations               | P3    |
| `Ctrl+E`             | Export PDF                     | P5    |
| `Ctrl+Z`             | Undo                           | P3    |
| `Ctrl+Shift+Z`       | Redo                           | P3    |
| `Ctrl+F`             | Search                         | P2    |
| `Ctrl+Shift+D`       | Toggle debug console           | P0    |
| `Escape`             | Deselect / cancel tool         | P3    |
| `Arrow Left/Right`   | Previous/Next page             | P2    |
| `Page Up / Page Down`| Previous/Next page             | P2    |
| `Ctrl++` / `Ctrl+-`  | Zoom in/out                    | P2    |
| `Ctrl+0`             | Reset zoom to 100%             | P2    |
| `T`                  | Activate text box tool         | P3    |
| `H`                  | Activate highlight tool        | P3    |
| `P`                  | Activate pencil tool           | P3    |
| `Delete`             | Delete selected annotation     | P3    |
