import { describe, expect, it } from 'vitest';

import { resolveLegacyPageTextTokens } from './legacyPageTextTokens';

describe('legacy page text token resolver', () => {
  it('resolves all supported legacy token spellings when enabled', () => {
    expect(
      resolveLegacyPageTextTokens(
        '{page}|{{page}}|{pages}|{{pages}}|{{total_pages}}|{file}|{{file}}|{{file_name}}|{date}|{{date}}',
        {
          page: 3,
          pages: 9,
          file: 'drawing.pdf',
          date: '9/19/2026',
          enablePageNumberToken: true,
          enableFileNameToken: true,
          enableDateToken: true,
        },
      ),
    ).toBe(
      '3|3|9|9|9|drawing.pdf|drawing.pdf|drawing.pdf|9/19/2026|9/19/2026',
    );
  });

  it('leaves disabled token families literal', () => {
    expect(
      resolveLegacyPageTextTokens(
        'Page {page} of {{pages}} — {file} — {{date}}',
        {
          page: 2,
          pages: 5,
          file: 'drawing.pdf',
          date: '9/19/2026',
          enablePageNumberToken: false,
          enableFileNameToken: false,
          enableDateToken: false,
        },
      ),
    ).toBe(
      'Page {page} of {{pages}} — {file} — {{date}}',
    );
  });
});
