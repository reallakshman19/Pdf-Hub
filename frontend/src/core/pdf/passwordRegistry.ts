const documentPasswords = new Map<string, string>();

export type PdfPasswordErrorKind = 'need-password' | 'incorrect-password';

export function normalizePdfPasswordKey(keyOrHash: string): string {
  const trimmed = keyOrHash.trim();
  return trimmed.startsWith('sha256:') ? trimmed.slice('sha256:'.length) : trimmed;
}

export function setPdfPasswordForDocumentKey(keyOrHash: string, password: string): void {
  const normalized = normalizePdfPasswordKey(keyOrHash);
  if (!normalized) return;
  documentPasswords.set(normalized, password);
}

export function getPdfPasswordForDocumentKey(keyOrHash: string): string | undefined {
  const normalized = normalizePdfPasswordKey(keyOrHash);
  if (!normalized) return undefined;
  return documentPasswords.get(normalized);
}

export function clearPdfPasswordForDocumentKey(keyOrHash: string): void {
  const normalized = normalizePdfPasswordKey(keyOrHash);
  if (!normalized) return;
  documentPasswords.delete(normalized);
}

export function clearAllPdfPasswords(): void {
  documentPasswords.clear();
}

export function classifyPdfPasswordError(error: unknown): PdfPasswordErrorKind | null {
  if (!error || typeof error !== 'object') {
    const message = String(error ?? '');
    if (/incorrect\s+password/i.test(message)) return 'incorrect-password';
    if (/no\s+password\s+given|passwordexception|password\s+required/i.test(message)) {
      return 'need-password';
    }
    return null;
  }

  const record = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  const code = typeof record.code === 'number' ? record.code : null;
  const message = typeof record.message === 'string' ? record.message : '';

  if (name === 'PasswordException') {
    if (code === 2 || /incorrect/i.test(message)) {
      return 'incorrect-password';
    }
    return 'need-password';
  }

  if (code === 2 && /password/i.test(message)) {
    return 'incorrect-password';
  }
  if (code === 1 && /password/i.test(message)) {
    return 'need-password';
  }
  if (/incorrect\s+password/i.test(message)) {
    return 'incorrect-password';
  }
  if (/no\s+password\s+given|password\s+required|encrypted\s+pdf/i.test(message)) {
    return 'need-password';
  }

  return null;
}
