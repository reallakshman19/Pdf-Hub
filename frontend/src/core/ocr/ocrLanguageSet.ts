export const DEFAULT_OCR_LANGUAGE = 'eng';

export type OcrLanguageSetInput =
  | string
  | readonly string[]
  | null
  | undefined;

export class OcrLanguageSetError extends Error {
  readonly code:
    | 'OCR_LANGUAGE_INVALID'
    | 'OCR_LANGUAGE_SET_EMPTY';

  constructor(
    code: OcrLanguageSetError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'OcrLanguageSetError';
    this.code = code;
  }
}

export function normalizeOcrLanguageSet(
  input: OcrLanguageSetInput,
  options: {
    defaultLanguage?: string;
    allowEmpty?: boolean;
  } = {},
): string[] {
  const tokens = expandLanguageTokens(input);
  const languages: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const language = token.trim();
    if (!language) continue;
    assertValidOcrLanguage(language);

    if (!seen.has(language)) {
      seen.add(language);
      languages.push(language);
    }
  }

  if (languages.length > 0) {
    return languages;
  }

  if (options.allowEmpty) {
    return [];
  }

  const fallback = options.defaultLanguage ?? DEFAULT_OCR_LANGUAGE;
  assertValidOcrLanguage(fallback);

  if (!fallback) {
    throw new OcrLanguageSetError(
      'OCR_LANGUAGE_SET_EMPTY',
      'OCR language set must contain at least one language.',
    );
  }

  return [fallback];
}

export function ocrLanguageSetToEngineSpec(
  input: OcrLanguageSetInput,
): string {
  return normalizeOcrLanguageSet(input).join('+');
}

export function ocrLanguageSetsEqual(
  left: OcrLanguageSetInput,
  right: OcrLanguageSetInput,
): boolean {
  const normalizedLeft = normalizeOcrLanguageSet(left);
  const normalizedRight = normalizeOcrLanguageSet(right);

  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every(
      (language, index) => language === normalizedRight[index],
    );
}

export function assertValidOcrLanguage(
  language: string,
): void {
  if (
    !language
    || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(language)
  ) {
    throw new OcrLanguageSetError(
      'OCR_LANGUAGE_INVALID',
      `Invalid OCR language identifier: ${JSON.stringify(language)}.`,
    );
  }
}

function expandLanguageTokens(
  input: OcrLanguageSetInput,
): string[] {
  if (input == null) {
    return [];
  }

  const raw = typeof input === 'string'
    ? [input]
    : [...input];

  return raw.flatMap((entry) =>
    entry
      .split(/[+,]/)
      .map((token) => token.trim()),
  );
}
