import { describe, expect, it } from 'vitest';

import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import {
  isPdfCommandSerializable,
  materializePdfCommand,
  type PdfCommand,
  type PdfCommandDraft,
} from './types';
import { validateCommand } from './validators';

function template(): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    name: 'Canonical footer',
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Inter',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#202020',
      opacity: 1,
    },
    rules: [
      {
        id: 'all-pages',
        selector: { include: { mode: 'all' } },
        footer: {
          right: {
            kind: 'text',
            template: 'Page {{physicalPage}} of {{pageCount}}',
          },
        },
      },
    ],
  };
}

describe('APPLY_HEADER_FOOTER_TEMPLATE command contract', () => {
  it('materializes the professional template as one serializable canonical command', () => {
    const draft: PdfCommandDraft = {
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: { template: template() },
    };

    const command = materializePdfCommand(
      draft,
      'api',
      'document-key',
      {
        id: 'header-footer-command',
        createdAt: '2026-09-19T00:00:00.000Z',
      },
    );

    expect(command.type).toBe('APPLY_HEADER_FOOTER_TEMPLATE');
    expect(command.source).toBe('api');
    expect(command.risk).toBe('safe');
    expect(isPdfCommandSerializable(command)).toBe(true);
    expect(validateCommand(command)).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects an invalid runtime command envelope before PageGraph planning', () => {
    const command = materializePdfCommand(
      {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: { template: template() },
      },
      'api',
      'document-key',
      {
        id: 'invalid-header-footer-command',
        createdAt: '2026-09-19T00:00:00.000Z',
      },
    ) as Extract<PdfCommand, { type: 'APPLY_HEADER_FOOTER_TEMPLATE' }>;

    (command.payload as { template: unknown }).template = {
      schemaVersion: 99,
      rules: [],
    };

    const result = validateCommand(command);

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/schemaVersion/);
    expect(result.errors.join('\n')).toMatch(/layout/);
    expect(result.errors.join('\n')).toMatch(/defaultTextStyle/);
    expect(result.errors.join('\n')).toMatch(/at least one rule/);
  });
});
