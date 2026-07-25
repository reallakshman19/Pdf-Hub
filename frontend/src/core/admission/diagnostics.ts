import type {
  AdmissionDiagnostic,
  AdmissionDiagnosticSeverity,
  AdmissionPhase,
} from './types';

const PHASE_ORDER: Readonly<Record<AdmissionPhase, number>> = {
  METADATA_PREFLIGHT: 10,
  BOUNDED_READ: 20,
  FORMAT_IDENTIFICATION: 30,
  STRUCTURE_INSPECTION: 40,
  CONTENT_MEASUREMENT: 50,
  CROSS_REFERENCE_RECONCILIATION: 60,
  VALIDATION: 70,
  COMMIT: 80,
  ROLLBACK: 90,
};

const SEVERITY_ORDER: Readonly<Record<AdmissionDiagnosticSeverity, number>> = {
  error: 10,
  warning: 20,
  info: 30,
};

export function sortAdmissionDiagnostics(
  diagnostics: readonly AdmissionDiagnostic[],
): AdmissionDiagnostic[] {
  return [...diagnostics].sort(compareAdmissionDiagnostics);
}

export function compareAdmissionDiagnostics(
  left: AdmissionDiagnostic,
  right: AdmissionDiagnostic,
): number {
  return compareOptionalNumber(left.inputIndex, right.inputIndex)
    || PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase]
    || compareOptionalString(left.path, right.path)
    || compareText(left.code, right.code)
    || SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || compareText(left.message, right.message);
}

export function isAdmissionError(
  diagnostic: AdmissionDiagnostic,
): boolean {
  return diagnostic.severity === 'error';
}

function compareOptionalNumber(
  left: number | undefined,
  right: number | undefined,
): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function compareOptionalString(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareText(left, right);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
