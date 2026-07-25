import { sortAdmissionDiagnostics } from './diagnostics';
import type {
  AdmissionDiagnostic,
  ArchivePathPolicy,
} from './types';

export interface ArchivePathInput {
  readonly rawPath: string;
  readonly inputIndex: number;
  readonly directory?: boolean;
}

export interface CanonicalArchivePath {
  readonly rawPath: string;
  readonly canonicalPath: string;
  readonly inputIndex: number;
  readonly kind: 'file' | 'directory';
}

export interface ArchivePathReconciliationResult {
  readonly entries: readonly CanonicalArchivePath[];
  readonly diagnostics: readonly AdmissionDiagnostic[];
}

export function reconcileArchivePaths(
  inputs: readonly ArchivePathInput[],
  policy: ArchivePathPolicy,
): ArchivePathReconciliationResult {
  const diagnostics: AdmissionDiagnostic[] = [];
  const entries: CanonicalArchivePath[] = [];

  for (const input of inputs) {
    const result = canonicalizeArchivePath(input, policy);
    if (result.entry) entries.push(result.entry);
    diagnostics.push(...result.diagnostics);
  }

  diagnostics.push(...findArchivePathCollisions(entries));

  return {
    entries: [...entries].sort((left, right) => left.inputIndex - right.inputIndex),
    diagnostics: sortAdmissionDiagnostics(diagnostics),
  };
}

export function canonicalizeArchivePath(
  input: ArchivePathInput,
  policy: ArchivePathPolicy,
): {
  readonly entry: CanonicalArchivePath | null;
  readonly diagnostics: readonly AdmissionDiagnostic[];
} {
  const diagnostics: AdmissionDiagnostic[] = [];
  const rawPath = input.rawPath;

  if (rawPath.length === 0) {
    diagnostics.push(pathDiagnostic(input, 'ARCHIVE_PATH_EMPTY', 'Archive path is empty.'));
    return { entry: null, diagnostics };
  }

  if (containsControlCharacter(rawPath)) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_CONTROL_CHARACTER',
      'Archive path contains a control character.',
    ));
  }

  if (rawPath.startsWith('/') || rawPath.startsWith('\\\\')) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_ABSOLUTE',
      'Archive path must be relative.',
    ));
  }

  if (/^[A-Za-z]:[\\/]/.test(rawPath)) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_DRIVE_QUALIFIED',
      'Archive path must not contain a drive-qualified prefix.',
    ));
  }

  const slashNormalized = rawPath.replaceAll('\\', '/');
  const withoutTrailingSlash = slashNormalized.endsWith('/')
    ? slashNormalized.slice(0, -1)
    : slashNormalized;
  const segments = withoutTrailingSlash.split('/');

  if (segments.some((segment) => segment.length === 0)) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_EMPTY_SEGMENT',
      'Archive path contains an empty segment.',
    ));
  }

  if (segments.includes('.')) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_DOT_SEGMENT',
      'Archive path contains a dot segment.',
    ));
  }

  if (segments.includes('..')) {
    diagnostics.push(pathDiagnostic(
      input,
      'ARCHIVE_PATH_TRAVERSAL',
      'Archive path contains a parent traversal segment.',
    ));
  }

  if (diagnostics.length > 0) {
    return { entry: null, diagnostics };
  }

  const unicodeNormalized = policy.unicodeMode === 'nfc'
    ? withoutTrailingSlash.normalize('NFC')
    : withoutTrailingSlash;
  const canonicalPath = policy.caseMode === 'ascii-insensitive'
    ? foldAsciiCase(unicodeNormalized)
    : unicodeNormalized;

  return {
    entry: {
      rawPath,
      canonicalPath,
      inputIndex: input.inputIndex,
      kind: input.directory === true || slashNormalized.endsWith('/')
        ? 'directory'
        : 'file',
    },
    diagnostics,
  };
}

function findArchivePathCollisions(
  entries: readonly CanonicalArchivePath[],
): AdmissionDiagnostic[] {
  const diagnostics: AdmissionDiagnostic[] = [];
  const byPath = new Map<string, CanonicalArchivePath>();

  for (const entry of [...entries].sort((left, right) => left.inputIndex - right.inputIndex)) {
    const existing = byPath.get(entry.canonicalPath);
    if (!existing) {
      byPath.set(entry.canonicalPath, entry);
      continue;
    }

    const code = existing.kind === entry.kind
      ? existing.rawPath === entry.rawPath
        ? 'ARCHIVE_PATH_DUPLICATE'
        : 'ARCHIVE_PATH_COLLISION'
      : 'ARCHIVE_FILE_DIRECTORY_COLLISION';

    diagnostics.push({
      severity: 'error',
      code,
      phase: 'STRUCTURE_INSPECTION',
      inputIndex: entry.inputIndex,
      path: entry.canonicalPath,
      message: `Archive path ${entry.rawPath} conflicts with ${existing.rawPath}.`,
    });
  }

  return diagnostics;
}

function pathDiagnostic(
  input: ArchivePathInput,
  code: AdmissionDiagnostic['code'],
  message: string,
): AdmissionDiagnostic {
  return {
    severity: 'error',
    code,
    phase: 'STRUCTURE_INSPECTION',
    inputIndex: input.inputIndex,
    path: input.rawPath,
    message,
  };
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}
