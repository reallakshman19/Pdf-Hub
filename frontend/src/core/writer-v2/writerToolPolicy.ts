import type { WriterV2Tool } from './writerV2Store';

const LEGACY_PLACEMENT_TOOLS = new Set<WriterV2Tool>([
  'richTextBox',
  'textCallout',
  'textStamp',
  'reviewLabel',
  'richNote',
  'tableBox',
]);

const ACTIVE_PLACEMENT_TOOLS = new Set<WriterV2Tool>([
  'selectBoxCopy',
]);

export interface WriterToolPolicyOptions {
  /**
   * Blank document mode uses Writer V2 elements as the primary document model,
   * so the placement tools are not legacy there. PDF overlay mode keeps the
   * historical guard unless the explicit localStorage escape hatch is enabled.
   */
  allowLegacyPlacement?: boolean;
}

export function isLegacyWriterPlacementTool(tool: WriterV2Tool): boolean {
  return LEGACY_PLACEMENT_TOOLS.has(tool);
}

export function isActiveWriterPlacementTool(tool: WriterV2Tool): boolean {
  return ACTIVE_PLACEMENT_TOOLS.has(tool);
}

export function isLegacyWriterPlacementEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const storage = window.localStorage;
  return storage.getItem('writer-v2-enable-legacy-placement') === '1';
}

export function normalizeWriterToolForRichAuthoring(
  tool: WriterV2Tool,
  options: WriterToolPolicyOptions = {},
): WriterV2Tool {
  if (tool === 'select' || tool === 'selectBoxCopy') {
    return tool;
  }

  if (
    isLegacyWriterPlacementTool(tool)
    && !options.allowLegacyPlacement
    && !isLegacyWriterPlacementEnabled()
  ) {
    return 'select';
  }

  return tool;
}

export function shouldWriterOverlayCapturePlacement(
  tool: WriterV2Tool,
  options: WriterToolPolicyOptions = {},
): boolean {
  if (tool === 'selectBoxCopy') {
    return false;
  }

  if (isLegacyWriterPlacementTool(tool)) {
    return Boolean(options.allowLegacyPlacement) || isLegacyWriterPlacementEnabled();
  }

  return false;
}
