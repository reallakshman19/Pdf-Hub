import type {
  PdfCommand,
  PdfCommandType,
} from '@/core/commands/types';
import type {
  HeaderFooterContent,
  HeaderFooterTemplate,
} from '@/core/header-footer/types';

export type HistoryReplayDisposition =
  | 'SELF_CONTAINED_REPLAY'
  | 'CHECKPOINT_REQUIRED'
  | 'NON_MUTATING';

export type HistoryReplayBarrierCode =
  | 'DONOR_RESOURCE_REQUIRED'
  | 'BINARY_RESOURCE_REQUIRED'
  | 'DESCRIPTIVE_STATE_COMMAND'
  | 'EXTERNAL_FILE_NAME_CONTEXT'
  | 'LOCALE_SENSITIVE_DATE_CONTEXT'
  | 'EXTERNAL_TEMPLATE_CONTEXT'
  | 'ARTIFACT_SIDE_EFFECT';

export interface HistoryReplayBarrier {
  code: HistoryReplayBarrierCode;
  resourceIds?: string[];
  contextKeys?: string[];
}

export interface HistoryReplayClassification {
  disposition: HistoryReplayDisposition;
  barriers: HistoryReplayBarrier[];
}

const SELF_CONTAINED: HistoryReplayClassification = {
  disposition: 'SELF_CONTAINED_REPLAY',
  barriers: [],
};

const NON_MUTATING: HistoryReplayClassification = {
  disposition: 'NON_MUTATING',
  barriers: [],
};

const LEGACY_FILE_TOKENS = [
  '{file}',
  '{{file_name}}',
  '{{file}}',
] as const;

const LEGACY_DATE_TOKENS = [
  '{date}',
  '{{date}}',
] as const;

const EXTERNAL_HEADER_FOOTER_TOKENS = new Set([
  'fileName',
  'title',
  'author',
]);

function checkpoint(
  barriers: HistoryReplayBarrier[],
): HistoryReplayClassification {
  return {
    disposition: 'CHECKPOINT_REQUIRED',
    barriers,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function headerFooterContents(
  template: HeaderFooterTemplate,
): HeaderFooterContent[] {
  const contents: HeaderFooterContent[] = [];

  for (const rule of template.rules) {
    for (const band of [rule.header, rule.footer]) {
      if (!band) continue;
      for (const content of [
        band.left,
        band.center,
        band.right,
      ]) {
        if (content) contents.push(content);
      }
    }
  }

  return contents;
}

function classifyHeaderFooter(
  template: HeaderFooterTemplate,
): HistoryReplayClassification {
  const contents = headerFooterContents(template);
  const binaryResourceIds = unique(
    contents.flatMap((content) =>
      content.kind === 'image'
        ? [content.binaryResourceId]
        : [],
    ),
  );
  const externalContextKeys = unique(
    contents.flatMap((content) => {
      if (content.kind !== 'text') return [];

      const keys: string[] = [];
      for (const match of content.template.matchAll(
        /{{\s*([^{}]+?)\s*}}/g,
      )) {
        const token = match[1]?.trim();
        if (!token) continue;
        if (EXTERNAL_HEADER_FOOTER_TOKENS.has(token)) {
          keys.push(token);
        } else if (token.startsWith('metadata:')) {
          keys.push(token);
        } else if (token.startsWith('var:')) {
          keys.push(token);
        }
      }
      return keys;
    }),
  );

  const barriers: HistoryReplayBarrier[] = [];
  if (binaryResourceIds.length > 0) {
    barriers.push({
      code: 'BINARY_RESOURCE_REQUIRED',
      resourceIds: binaryResourceIds,
    });
  }
  if (externalContextKeys.length > 0) {
    barriers.push({
      code: 'EXTERNAL_TEMPLATE_CONTEXT',
      contextKeys: externalContextKeys,
    });
  }

  return barriers.length > 0
    ? checkpoint(barriers)
    : SELF_CONTAINED;
}

function textIncludesAny(
  text: string,
  tokens: readonly string[],
): boolean {
  return tokens.some((token) => text.includes(token));
}

function classifyDrawText(
  command: Extract<PdfCommand, { type: 'DRAW_TEXT_ON_PAGES' }>,
): HistoryReplayClassification {
  const barriers: HistoryReplayBarrier[] = [];
  const { options } = command.payload;

  if (
    options.fileNameToken
    && textIncludesAny(options.text, LEGACY_FILE_TOKENS)
  ) {
    barriers.push({
      code: 'EXTERNAL_FILE_NAME_CONTEXT',
      contextKeys: ['fileName'],
    });
  }

  if (
    options.dateToken
    && textIncludesAny(options.text, LEGACY_DATE_TOKENS)
  ) {
    barriers.push({
      code: 'LOCALE_SENSITIVE_DATE_CONTEXT',
      contextKeys: ['locale', 'createdAt'],
    });
  }

  return barriers.length > 0
    ? checkpoint(barriers)
    : SELF_CONTAINED;
}

/**
 * Classifies whether a canonical command can participate in future
 * reconstruction replay. This is policy only: callers must not infer that
 * journal replay exists merely because a command is self-contained.
 */
export function classifyHistoryReplayability(
  command: PdfCommand,
): HistoryReplayClassification {
  switch (command.type) {
    case 'ROTATE_PAGES':
    case 'REORDER_PAGES':
    case 'REORDER_PAGES_BY_ORDER':
    case 'DELETE_PAGES':
    case 'INSERT_BLANK_PAGE':
    case 'DUPLICATE_PAGES':
    case 'SET_PAGE_LABELS':
    case 'DRAW_REDACTION_BOX':
    case 'REPLACE_EXISTING_TEXT':
    case 'RECONSTRUCT_EXISTING_TEXT':
      return SELF_CONTAINED;

    case 'DRAW_TEXT_ON_PAGES':
      return classifyDrawText(command);

    case 'APPLY_HEADER_FOOTER_TEMPLATE':
      return classifyHeaderFooter(
        command.payload.template,
      );

    case 'INSERT_PAGES':
      return checkpoint([{
        code: 'DONOR_RESOURCE_REQUIRED',
        resourceIds: [command.payload.donorResourceId],
      }]);

    case 'REPLACE_PAGE':
      return checkpoint([{
        code: 'DONOR_RESOURCE_REQUIRED',
        resourceIds: [command.payload.donorResourceId],
      }]);

    case 'MERGE_PDF':
      return checkpoint([{
        code: 'DONOR_RESOURCE_REQUIRED',
        resourceIds: unique(
          command.payload.donorResourceIds,
        ),
      }]);

    case 'APPLY_WORKING_COPY':
      return checkpoint([{
        code: 'BINARY_RESOURCE_REQUIRED',
        resourceIds: [
          command.payload.binaryResourceId,
        ],
      }]);

    case 'ANNOTATION_CHANGE':
    case 'WRITER_CHANGE':
      return checkpoint([{
        code: 'DESCRIPTIVE_STATE_COMMAND',
      }]);

    case 'SPLIT_PAGES':
      return checkpoint([{
        code: 'ARTIFACT_SIDE_EFFECT',
      }]);

    case 'EXTRACT_PAGES':
      return NON_MUTATING;

    default:
      return assertNever(command);
  }
}

export const HISTORY_REPLAY_POLICY_COMMAND_TYPES: ReadonlySet<PdfCommandType> =
  new Set<PdfCommandType>([
    'ROTATE_PAGES',
    'REORDER_PAGES',
    'REORDER_PAGES_BY_ORDER',
    'EXTRACT_PAGES',
    'SPLIT_PAGES',
    'DELETE_PAGES',
    'INSERT_PAGES',
    'INSERT_BLANK_PAGE',
    'REPLACE_PAGE',
    'DUPLICATE_PAGES',
    'MERGE_PDF',
    'SET_PAGE_LABELS',
    'APPLY_HEADER_FOOTER_TEMPLATE',
    'DRAW_TEXT_ON_PAGES',
    'DRAW_REDACTION_BOX',
    'REPLACE_EXISTING_TEXT',
    'RECONSTRUCT_EXISTING_TEXT',
    'ANNOTATION_CHANGE',
    'WRITER_CHANGE',
    'APPLY_WORKING_COPY',
  ]);

function assertNever(value: never): never {
  throw new Error(
    `Unclassified history command: ${JSON.stringify(value)}`,
  );
}
