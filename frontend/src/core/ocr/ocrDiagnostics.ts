import type {
  OcrDiagnostic,
  OcrDiagnosticCode,
  OcrDiagnosticLevel,
} from './types';

export function createOcrDiagnostic(input: {
  level: OcrDiagnosticLevel;
  code: OcrDiagnosticCode;
  message: string;
  pageIndex?: number;
  targetId?: string;
}): OcrDiagnostic {
  return {
    level: input.level,
    code: input.code,
    message: input.message,
    pageIndex: input.pageIndex,
    targetId: input.targetId,
  };
}

export function hasFatalOcrDiagnostics(
  diagnostics: OcrDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'error');
}

export function countOcrDiagnosticsByLevel(
  diagnostics: OcrDiagnostic[],
): Record<OcrDiagnosticLevel, number> {
  return diagnostics.reduce<Record<OcrDiagnosticLevel, number>>(
    (counts, diagnostic) => {
      counts[diagnostic.level] += 1;
      return counts;
    },
    {
      info: 0,
      warning: 0,
      error: 0,
    },
  );
}
