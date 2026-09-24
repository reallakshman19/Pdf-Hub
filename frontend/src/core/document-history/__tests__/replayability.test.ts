import { describe, expect, it } from 'vitest';

import {
  materializePdfCommand,
  type PdfCommandDraft,
  type PdfCommandType,
} from '@/core/commands/types';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import {
  classifyHistoryReplayability,
  HISTORY_REPLAY_POLICY_COMMAND_TYPES,
  type HistoryReplayDisposition,
} from '../replayability';

function command(draft: PdfCommandDraft) {
  return materializePdfCommand(
    draft,
    'toolbar',
    'doc',
    {
      id: `test-${draft.type}`,
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  );
}

function existingTextDraft():
  PdfCommandDraft {
  const span =
    buildExistingTextSpan(
      {
        revisionId: 'doc',
        pageId: 'stable-page',
        pageIndex: 0,
      },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [
          12, 0, 0, 12, 72, 700,
        ],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

  return {
    type:
      'REPLACE_EXISTING_TEXT',
    payload: {
      schemaVersion: 1,
      span,
      intent:
        createExistingTextEditIntent(
          span,
          'World',
        ),
      provenance: {
        streamIndex: 0,
        streamRef: '7 0 R',
        operatorIndex: 4,
        operator: 'Tj',
        operatorRange: {
          start: 18,
          end: 20,
        },
        operandRange: {
          start: 10,
          end: 17,
        },
        decodedText: 'Hello',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        fontSizePt: 12,
        textMatrix: [
          1, 0, 0, 1, 72, 700,
        ],
      },
    },
  };
}

function textTemplate(
  template: string,
): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Helvetica',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#111827',
      opacity: 1,
    },
    rules: [{
      id: 'rule',
      selector: {
        include: { mode: 'all' },
      },
      footer: {
        center: {
          kind: 'text',
          template,
        },
      },
    }],
  };
}

const expectedDispositions = {
  ROTATE_PAGES: 'SELF_CONTAINED_REPLAY',
  REORDER_PAGES: 'SELF_CONTAINED_REPLAY',
  REORDER_PAGES_BY_ORDER: 'SELF_CONTAINED_REPLAY',
  EXTRACT_PAGES: 'NON_MUTATING',
  SPLIT_PAGES: 'CHECKPOINT_REQUIRED',
  DELETE_PAGES: 'SELF_CONTAINED_REPLAY',
  INSERT_PAGES: 'CHECKPOINT_REQUIRED',
  INSERT_BLANK_PAGE: 'SELF_CONTAINED_REPLAY',
  REPLACE_PAGE: 'CHECKPOINT_REQUIRED',
  DUPLICATE_PAGES: 'SELF_CONTAINED_REPLAY',
  MERGE_PDF: 'CHECKPOINT_REQUIRED',
  SET_PAGE_LABELS: 'SELF_CONTAINED_REPLAY',
  APPLY_HEADER_FOOTER_TEMPLATE: 'SELF_CONTAINED_REPLAY',
  DRAW_TEXT_ON_PAGES: 'SELF_CONTAINED_REPLAY',
  DRAW_REDACTION_BOX: 'SELF_CONTAINED_REPLAY',
  REPLACE_EXISTING_TEXT: 'SELF_CONTAINED_REPLAY',
  ANNOTATION_CHANGE: 'CHECKPOINT_REQUIRED',
  WRITER_CHANGE: 'CHECKPOINT_REQUIRED',
  APPLY_WORKING_COPY: 'CHECKPOINT_REQUIRED',
} satisfies Record<PdfCommandType, HistoryReplayDisposition>;

describe('history replayability policy', () => {
  it('keeps the policy command set exhaustive with PdfCommandType', () => {
    expect(
      [...HISTORY_REPLAY_POLICY_COMMAND_TYPES].sort(),
    ).toEqual(
      Object.keys(expectedDispositions).sort(),
    );
  });

  it('classifies deterministic and resource-bound command families', () => {
    const cases: PdfCommandDraft[] = [
      { type: 'ROTATE_PAGES', payload: { pageIndices: [0], angle: 90 } },
      { type: 'REORDER_PAGES', payload: { fromIndex: 0, toIndex: 1 } },
      { type: 'REORDER_PAGES_BY_ORDER', payload: { order: [1, 0] } },
      { type: 'EXTRACT_PAGES', payload: { pageIndices: [0] } },
      { type: 'SPLIT_PAGES', payload: { pageIndices: [0] } },
      { type: 'DELETE_PAGES', payload: { pageIndices: [0] } },
      { type: 'INSERT_PAGES', payload: { atIndex: 0, donorResourceId: 'donor-a' } },
      { type: 'INSERT_BLANK_PAGE', payload: { atIndex: 0, size: { width: 595, height: 842 } } },
      { type: 'REPLACE_PAGE', payload: { atIndex: 0, donorResourceId: 'donor-b', donorPageIndex: 0 } },
      { type: 'DUPLICATE_PAGES', payload: { pageIndices: [0] } },
      { type: 'MERGE_PDF', payload: { donorResourceIds: ['donor-a', 'donor-b'] } },
      { type: 'SET_PAGE_LABELS', payload: { ranges: [] } },
      { type: 'APPLY_HEADER_FOOTER_TEMPLATE', payload: { template: textTemplate('{{pageLabel}}') } },
      { type: 'DRAW_TEXT_ON_PAGES', payload: { pageIndices: [0], options: { text: 'Page {page}', x: 10, y: 10, fontSize: 12, pageNumberToken: true } } },
      { type: 'DRAW_REDACTION_BOX', payload: { pageIndices: [0], options: { x: 10, y: 10, width: 20, height: 20 } } },
      existingTextDraft(),
      { type: 'ANNOTATION_CHANGE', payload: { action: 'add', annotationIds: ['a'] } },
      { type: 'WRITER_CHANGE', payload: { action: 'move', elementIds: ['w'] } },
      { type: 'APPLY_WORKING_COPY', payload: { binaryResourceId: 'working-copy' } },
    ];

    for (const draft of cases) {
      expect(
        classifyHistoryReplayability(command(draft)).disposition,
        draft.type,
      ).toBe(expectedDispositions[draft.type]);
    }
  });

  it('keeps existing-text replacement self-contained across journal JSON serialization', () => {
    const draft =
      existingTextDraft();
    const roundTripped =
      JSON.parse(
        JSON.stringify(draft),
      ) as PdfCommandDraft;

    expect(roundTripped)
      .toEqual(draft);
    expect(
      classifyHistoryReplayability(
        command(roundTripped),
      ).disposition,
    ).toBe(
      'SELF_CONTAINED_REPLAY',
    );
  });

  it('reports the split artifact side-effect barrier', () => {
    expect(
      classifyHistoryReplayability(command({
        type: 'SPLIT_PAGES',
        payload: { pageIndices: [0] },
      })),
    ).toEqual({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'ARTIFACT_SIDE_EFFECT',
      }],
    });
  });

  it('reports exact donor and binary resource barriers', () => {
    expect(
      classifyHistoryReplayability(command({
        type: 'MERGE_PDF',
        payload: {
          donorResourceIds: ['donor-a', 'donor-a', 'donor-b'],
        },
      })),
    ).toEqual({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'DONOR_RESOURCE_REQUIRED',
        resourceIds: ['donor-a', 'donor-b'],
      }],
    });

    expect(
      classifyHistoryReplayability(command({
        type: 'APPLY_WORKING_COPY',
        payload: { binaryResourceId: 'working-copy' },
      })),
    ).toEqual({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'BINARY_RESOURCE_REQUIRED',
        resourceIds: ['working-copy'],
      }],
    });
  });

  it('requires a checkpoint for image-bearing or external-context header/footer templates', () => {
    const imageTemplate = textTemplate('{{pageLabel}}');
    imageTemplate.rules[0]!.header = {
      left: {
        kind: 'image',
        binaryResourceId: 'logo',
        widthPt: 24,
      },
    };

    expect(
      classifyHistoryReplayability(command({
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: { template: imageTemplate },
      })),
    ).toMatchObject({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'BINARY_RESOURCE_REQUIRED',
        resourceIds: ['logo'],
      }],
    });

    expect(
      classifyHistoryReplayability(command({
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: {
          template: textTemplate(
            '{{fileName}} / {{metadata:case}} / {{var:section}}',
          ),
        },
      })),
    ).toEqual({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [{
        code: 'EXTERNAL_TEMPLATE_CONTEXT',
        contextKeys: [
          'fileName',
          'metadata:case',
          'var:section',
        ],
      }],
    });
  });

  it('treats deterministic header/footer date and page tokens as replayable', () => {
    expect(
      classifyHistoryReplayability(command({
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: {
          template: textTemplate(
            '{{pageLabel}} {{date}} {{time}}',
          ),
        },
      })).disposition,
    ).toBe('SELF_CONTAINED_REPLAY');
  });

  it('requires external context only when enabled legacy text tokens are actually present', () => {
    expect(
      classifyHistoryReplayability(command({
        type: 'DRAW_TEXT_ON_PAGES',
        payload: {
          pageIndices: [0],
          options: {
            text: '{{file_name}} {date}',
            x: 10,
            y: 10,
            fontSize: 12,
            fileNameToken: true,
            dateToken: true,
          },
        },
      })),
    ).toEqual({
      disposition: 'CHECKPOINT_REQUIRED',
      barriers: [
        {
          code: 'EXTERNAL_FILE_NAME_CONTEXT',
          contextKeys: ['fileName'],
        },
        {
          code: 'LOCALE_SENSITIVE_DATE_CONTEXT',
          contextKeys: ['locale', 'createdAt'],
        },
      ],
    });

    expect(
      classifyHistoryReplayability(command({
        type: 'DRAW_TEXT_ON_PAGES',
        payload: {
          pageIndices: [0],
          options: {
            text: 'Literal text',
            x: 10,
            y: 10,
            fontSize: 12,
            fileNameToken: true,
            dateToken: true,
          },
        },
      })).disposition,
    ).toBe('SELF_CONTAINED_REPLAY');
  });
});
