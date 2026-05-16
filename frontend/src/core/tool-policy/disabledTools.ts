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
  callout: {
    disabled: true,
    reason: 'Use the Writer V2 Callout button instead (in the toolbar).',
    replacement: 'Writer V2 Text Callout',
  },
  stamp: {
    disabled: true,
    reason: 'Use the Writer V2 Stamp button instead (in the toolbar).',
    replacement: 'Writer V2 Text Stamp',
  },
};

export function isToolDisabled(tool: ActiveTool | string): boolean {
  return Object.prototype.hasOwnProperty.call(DISABLED_TOOLS, tool);
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
