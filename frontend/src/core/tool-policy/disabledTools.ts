import type { ActiveTool } from '@/core/editor/types';

export interface DisabledToolInfo {
  disabled: true;
  reason: string;
  replacement?: string;
}

const COORDINATE_ENGINE_REASON =
  'Disabled until Writer Overlay V2 coordinate engine is certified.';

export const DISABLED_TOOLS: Partial<Record<ActiveTool, DisabledToolInfo>> = {
  textbox: {
    disabled: true,
    reason: 'Old textbox is disabled. Use Writer Overlay V2 after certification.',
    replacement: 'Writer Element',
  },
  ink: {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  comment: {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  'sticky-note': {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  callout: {
    disabled: true,
    reason: 'Old callout is disabled. It will be rebuilt as Writer V2 Text Callout.',
    replacement: 'Writer V2 Text Callout',
  },
  'shape-rect': {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  'shape-ellipse': {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  'shape-cloud': {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  'shape-polygon': {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  stamp: {
    disabled: true,
    reason: 'Old stamp is disabled. It will be rebuilt as Writer V2 Text Stamp.',
    replacement: 'Writer V2 Text Stamp',
  },
  line: {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  arrow: {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  redaction: {
    disabled: true,
    reason: COORDINATE_ENGINE_REASON,
  },
  squiggly: {
    disabled: true,
    reason: 'Squiggly is disabled until text-quad based markup is certified.',
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
