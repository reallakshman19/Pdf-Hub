import React from 'react';
import { ToolbarFile } from '@/components/toolbar/ToolbarFile';
import { ToolbarOrganize } from '@/components/toolbar/ToolbarOrganize';
import { ToolbarComment as ToolbarAnnotate } from '@/components/toolbar/ToolbarComment';
import { ToolbarMacro as ToolbarGenerate } from '@/components/toolbar/ToolbarMacro';
import { ToolbarView } from '@/components/toolbar/ToolbarView';
import { ToolbarWriter } from '@/components/toolbar/ToolbarWriter';

// ─── ToolbarDivider ────────────────────────────────────────────────────────
function ToolbarDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width:      1,
        height:     20,
        background: 'var(--color-border-tertiary)',
        margin:     '0 6px',
        flexShrink: 0,
        alignSelf:  'center',
      }}
    />
  );
}

// ─── ToolbarGroup ──────────────────────────────────────────────────────────
interface ToolbarGroupProps {
  label:    string;
  children: React.ReactNode;
}

function ToolbarGroup({ label, children }: ToolbarGroupProps) {
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        flexShrink:    0,
        // Height budget: 28px buttons + 12px label = 40px
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 28 }}>
        {children}
      </div>
      <span
        style={{
          fontSize:   10,
          lineHeight: '12px',
          color:      'var(--color-text-tertiary)',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── ToolbarBand ───────────────────────────────────────────────────────────
/**
 * Single-row toolbar — 40px fixed height.
 *
 * REMOVED: two-row tab/ribbon system, RIBBON_TABS, activeTab state,
 *          setActiveRibbonTab, conditional group rendering.
 *
 * PRESERVED: RibbonTab type in core/editor/types.ts (Agent F uses it).
 *            All toolbar groups render unconditionally.
 *            Horizontal scroll on narrow viewports (scrollbar hidden).
 *
 * Agent F slot: see comment at bottom of JSX.
 */
export function ToolbarBand() {
  return (
    <div
      className="toolbar-band-no-scrollbar"
      style={{
        display:        'flex',
        flexDirection:  'row',
        alignItems:     'center',
        height:         40,         // FIXED — never change
        minHeight:      40,         // FIXED — never change
        maxHeight:      40,         // FIXED — prevents accidental growth
        padding:        '0 8px',
        borderBottom:   '0.5px solid var(--color-border-tertiary)',
        background:     'var(--color-background-primary)',
        overflowX:      'auto',
        overflowY:      'hidden',
        scrollbarWidth: 'none',     // Firefox
        flexShrink:     0,          // critical — prevents AppShell layout break
      }}
    >
      <ToolbarGroup label="File">
        <ToolbarFile />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Organize">
        <ToolbarOrganize />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Annotate">
        <ToolbarAnnotate />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Generate">
        <ToolbarGenerate />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="View">
        <ToolbarView />
      </ToolbarGroup>

      <ToolbarDivider />
      <ToolbarGroup label="Writer">
        <ToolbarWriter />
      </ToolbarGroup>
    </div>
  );
}
