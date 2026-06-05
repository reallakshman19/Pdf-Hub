import type {
  WriterDocxDiagnosticCode,
  WriterDocxDiagnosticLevel,
  WriterDocxExportDiagnostic,
} from './types';
import type { WriterElementV2 } from '../../types';

export function createWriterDocxDiagnostic(
  level: WriterDocxDiagnosticLevel,
  code: WriterDocxDiagnosticCode,
  message: string,
  element?: Pick<WriterElementV2, 'id' | 'type' | 'pageIndex'>,
): WriterDocxExportDiagnostic {
  return {
    level,
    code,
    message,
    elementId: element?.id,
    elementType: element?.type,
    pageIndex: element?.pageIndex,
  };
}

export function hasFatalDocxDiagnostics(
  diagnostics: WriterDocxExportDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'error');
}
