export const WRITER_PROJECT_MEMBER_PROFILE_ID =
  'WRITER_PROJECT_MEMBER_PROFILE_V1' as const;

export const WRITER_PROJECT_MEMBER_PROFILE_AUTHORITY =
  'OWNER_APPROVED' as const;

export type WriterProjectRequiredRootFile =
  | 'manifest.json'
  | 'writer-elements.json'
  | 'writer-assets.json';

export type WriterProjectOptionalRootFile =
  | 'original.pdf'
  | 'writer-document-meta.json';

export type WriterProjectDirectoryMarker = 'assets/' | 'ocr/';

export type WriterProjectOcrCompatibilityFile =
  | 'ocr/manifest.json'
  | 'ocr/result.json'
  | 'ocr/corrections.json'
  | 'ocr/regions.json'
  | 'ocr/writer-insertion-queue.json';

export interface WriterProjectMemberProfileV1 {
  readonly profileId: typeof WRITER_PROJECT_MEMBER_PROFILE_ID;
  readonly authority: typeof WRITER_PROJECT_MEMBER_PROFILE_AUTHORITY;
  readonly requiredRootFiles: readonly WriterProjectRequiredRootFile[];
  readonly optionalRootFiles: readonly WriterProjectOptionalRootFile[];
  readonly allowedDirectoryMarkers: readonly WriterProjectDirectoryMarker[];
  readonly assetNamespace: {
    readonly root: 'assets/';
    readonly directFilesOnly: true;
  };
  readonly ocrCompatibilityFiles: readonly WriterProjectOcrCompatibilityFile[];
}

const REQUIRED_ROOT_FILES = [
  'manifest.json',
  'writer-elements.json',
  'writer-assets.json',
] as const;

const OPTIONAL_ROOT_FILES = [
  'original.pdf',
  'writer-document-meta.json',
] as const;

const ALLOWED_DIRECTORY_MARKERS = ['assets/', 'ocr/'] as const;

const OCR_COMPATIBILITY_FILES = [
  'ocr/manifest.json',
  'ocr/result.json',
  'ocr/corrections.json',
  'ocr/regions.json',
  'ocr/writer-insertion-queue.json',
] as const;

export const WRITER_PROJECT_MEMBER_PROFILE_V1: WriterProjectMemberProfileV1 =
  deepFreeze({
    profileId: WRITER_PROJECT_MEMBER_PROFILE_ID,
    authority: WRITER_PROJECT_MEMBER_PROFILE_AUTHORITY,
    requiredRootFiles: [...REQUIRED_ROOT_FILES],
    optionalRootFiles: [...OPTIONAL_ROOT_FILES],
    allowedDirectoryMarkers: [...ALLOWED_DIRECTORY_MARKERS],
    assetNamespace: {
      root: 'assets/' as const,
      directFilesOnly: true as const,
    },
    ocrCompatibilityFiles: [...OCR_COMPATIBILITY_FILES],
  });

export function createWriterProjectMemberProfileForTest(
  overrides: Partial<
    Pick<
      WriterProjectMemberProfileV1,
      | 'requiredRootFiles'
      | 'optionalRootFiles'
      | 'allowedDirectoryMarkers'
      | 'ocrCompatibilityFiles'
    >
  > & {
    readonly assetNamespace?: WriterProjectMemberProfileV1['assetNamespace'];
  } = {},
): WriterProjectMemberProfileV1 {
  return deepFreeze({
    profileId: WRITER_PROJECT_MEMBER_PROFILE_ID,
    authority: WRITER_PROJECT_MEMBER_PROFILE_AUTHORITY,
    requiredRootFiles: [
      ...(overrides.requiredRootFiles ?? REQUIRED_ROOT_FILES),
    ],
    optionalRootFiles: [
      ...(overrides.optionalRootFiles ?? OPTIONAL_ROOT_FILES),
    ],
    allowedDirectoryMarkers: [
      ...(overrides.allowedDirectoryMarkers ?? ALLOWED_DIRECTORY_MARKERS),
    ],
    assetNamespace: {
      ...(overrides.assetNamespace ?? {
        root: 'assets/' as const,
        directFilesOnly: true as const,
      }),
    },
    ocrCompatibilityFiles: [
      ...(overrides.ocrCompatibilityFiles ?? OCR_COMPATIBILITY_FILES),
    ],
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
