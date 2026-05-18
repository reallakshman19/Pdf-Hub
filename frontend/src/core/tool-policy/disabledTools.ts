import type { ActiveTool } from '@/core/editor/types';

export interface DisabledToolInfo {
  disabled: true;
  reason: string;
  replacement?: string;
}

export const DISABLED_TOOLS: Partial<Record<ActiveTool, DisabledToolInfo>> = {
  // Legacy tools replaced by Writer Overlay V2 — keep disabled to avoid duplicate UX
  textbox: {
    disabled: true,
    reason: 'Use the Writer V2 Text Box button instead (in the toolbar).',
    replacement: 'Writer V2 Text Box',
  },
  stamp: {
    disabled: true,
    reason: 'Use the Writer V2 Stamp button instead (in the toolbar).',
    replacement: 'Writer V2 Text Stamp',
  },
};

// Annotation tools that are safe in Annotate mode but must not activate
// when Writer Overlay V2 is the active mode. Enumerated here so the
// disabled-tools boundary audit can verify every unsafe tool is accounted for.
export const WRITE_MODE_BLOCKED_TOOLS: Partial<Record<ActiveTool, true>> = {
  ink: true,
  comment: true,
  callout: true,
  'sticky-note': true,
  'shape-rect': true,
  'shape-ellipse': true,
  'shape-cloud': true,
  'shape-polygon': true,
  line: true,
  arrow: true,
  redaction: true,
  squiggly: true,
};

export function isToolDisabled(tool: ActiveTool | string): boolean {
  return Object.prototype.hasOwnProperty.call(DISABLED_TOOLS, tool);
}

export function isToolBlockedInWriteMode(tool: ActiveTool | string): boolean {
  return Object.prototype.hasOwnProperty.call(WRITE_MODE_BLOCKED_TOOLS, tool);
}

export function getToolDisabledReason(tool: ActiveTool | string): string | null {
  return DISABLED_TOOLS[tool as ActiveTool]?.reason ?? null;
}

export function normalizeActiveTool(tool: ActiveTool): ActiveTool {
  return isToolDisabled(tool) ? 'select' : tool;
}

export function assertToolAllowed(tool: ActiveTool): void {
  const reason = getToolDisabledReason(tool);

  if (reason) {
    throw new Error(`Tool "${tool}" is disabled: ${reason}`);
  }
}
