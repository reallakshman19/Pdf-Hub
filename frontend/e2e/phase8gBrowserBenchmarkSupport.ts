import {
  expect,
  type Page,
} from '@playwright/test';

export interface Phase8gSourceDiagnostic {
  cacheKey: string;
  sourceKind: string;
  sourceSize: number;
  rangeRequests: number;
  rangeBytesDelivered: number;
  maxRequestedRangeBytes: number;
}

export async function phase8gRendererDiagnostics(
  page: Page,
): Promise<
  Phase8gSourceDiagnostic[]
> {
  return page.evaluate(
    async () => {
      const moduleUrl =
        new URL(
          'src/adapters/pdf-renderer/PdfRendererAdapter.ts',
          document.baseURI,
        ).href;
      const dynamicImport =
        new Function(
          'url',
          'return import(url)',
        ) as (
          url: string,
        ) => Promise<{
          PdfRendererAdapter: {
            getDocumentSourceCacheDiagnostics:
              () =>
                Phase8gSourceDiagnostic[];
          };
        }>;
      const module =
        await dynamicImport(
          moduleUrl,
        );
      return module
        .PdfRendererAdapter
        .getDocumentSourceCacheDiagnostics();
    },
  );
}

export async function waitForPhase8gRenderedPage(
  page: Page,
  pageNumber: number,
): Promise<void> {
  const surface =
    page.locator(
      `[data-page="${pageNumber}"]`,
    );
  await expect(surface)
    .toBeVisible({
      timeout: 60_000,
    });

  await page.waitForFunction(
    (target) => {
      const surface =
        document.querySelector(
          `[data-page="${target}"]`,
        );
      const canvas =
        surface?.querySelector(
          'canvas',
        );
      return Boolean(
        canvas
        && (
          canvas.width > 300
          || canvas.height > 150
        ),
      );
    },
    pageNumber,
    {
      timeout: 60_000,
    },
  );
}

export async function jumpToPhase8gPage(
  page: Page,
  pageNumber: number,
): Promise<number> {
  const input =
    page.locator(
      'input[inputmode="numeric"][aria-label^="Page "]',
    ).first();
  const started =
    performance.now();
  await input.fill(
    String(pageNumber),
  );
  await input.press('Enter');
  await waitForPhase8gRenderedPage(
    page,
    pageNumber,
  );
  return (
    performance.now()
    - started
  );
}

export function phase8gMedian(
  values: readonly number[],
): number {
  const ordered =
    [...values].sort(
      (left, right) =>
        left - right,
    );
  const middle =
    Math.floor(
      ordered.length / 2,
    );
  if (
    ordered.length % 2 === 0
  ) {
    return (
      ordered[middle - 1]!
      + ordered[middle]!
    ) / 2;
  }
  return ordered[middle] ?? 0;
}
