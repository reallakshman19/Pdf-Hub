import { WRITER_PROJECT_MEMBER_PROFILE_V1 } from './writerProjectMemberProfile';

export const WRITER_PROJECT_JSON_SOURCE_POLICY_ID =
  'WRITER_PROJECT_JSON_SOURCE_POLICY_V1' as const;
export const WRITER_PROJECT_JSON_SOURCE_POLICY_AUTHORITY =
  'OWNER_APPROVED' as const;

export type WriterProjectJsonSourcePath =
  | 'manifest.json'
  | 'writer-elements.json'
  | 'writer-assets.json'
  | 'writer-document-meta.json'
  | 'ocr/manifest.json'
  | 'ocr/result.json'
  | 'ocr/corrections.json'
  | 'ocr/regions.json'
  | 'ocr/writer-insertion-queue.json';

export interface WriterProjectJsonSourcePolicyV1 {
  readonly profileId: typeof WRITER_PROJECT_JSON_SOURCE_POLICY_ID;
  readonly authority: typeof WRITER_PROJECT_JSON_SOURCE_POLICY_AUTHORITY;
  readonly sourceMemberProfileId: typeof WRITER_PROJECT_MEMBER_PROFILE_V1.profileId;
  readonly jsonSourceCatalog: readonly WriterProjectJsonSourcePath[];
  readonly pathByteLimits: Readonly<Record<WriterProjectJsonSourcePath, number>>;
  readonly maxTotalJsonSourceBytes: number;
  readonly utf8DecodeChunkBytes: number;
  readonly maxJsonSourceCount: number;
}

const JSON_SOURCE_CATALOG = [
  'manifest.json',
  'writer-elements.json',
  'writer-assets.json',
  'writer-document-meta.json',
  'ocr/manifest.json',
  'ocr/result.json',
  'ocr/corrections.json',
  'ocr/regions.json',
  'ocr/writer-insertion-queue.json',
] as const;

const PATH_BYTE_LIMITS: Record<WriterProjectJsonSourcePath, number> = {
  'manifest.json': 1_048_576,
  'writer-elements.json': 33_554_432,
  'writer-assets.json': 16_777_216,
  'writer-document-meta.json': 2_097_152,
  'ocr/manifest.json': 1_048_576,
  'ocr/result.json': 67_108_864,
  'ocr/corrections.json': 16_777_216,
  'ocr/regions.json': 16_777_216,
  'ocr/writer-insertion-queue.json': 33_554_432,
};

export const WRITER_PROJECT_JSON_SOURCE_POLICY_V1: WriterProjectJsonSourcePolicyV1 =
  deepFreeze({
    profileId: WRITER_PROJECT_JSON_SOURCE_POLICY_ID,
    authority: WRITER_PROJECT_JSON_SOURCE_POLICY_AUTHORITY,
    sourceMemberProfileId: WRITER_PROJECT_MEMBER_PROFILE_V1.profileId,
    jsonSourceCatalog: [...JSON_SOURCE_CATALOG],
    pathByteLimits: { ...PATH_BYTE_LIMITS },
    maxTotalJsonSourceBytes: 100_663_296,
    utf8DecodeChunkBytes: 262_144,
    maxJsonSourceCount: 9,
  });

export function createWriterProjectJsonSourcePolicyForTest(
  overrides: Partial<
    Pick<
      WriterProjectJsonSourcePolicyV1,
      | 'jsonSourceCatalog'
      | 'pathByteLimits'
      | 'maxTotalJsonSourceBytes'
      | 'utf8DecodeChunkBytes'
      | 'maxJsonSourceCount'
    >
  > = {},
): WriterProjectJsonSourcePolicyV1 {
  return deepFreeze({
    profileId: WRITER_PROJECT_JSON_SOURCE_POLICY_ID,
    authority: WRITER_PROJECT_JSON_SOURCE_POLICY_AUTHORITY,
    sourceMemberProfileId: WRITER_PROJECT_MEMBER_PROFILE_V1.profileId,
    jsonSourceCatalog: [
      ...(overrides.jsonSourceCatalog ?? JSON_SOURCE_CATALOG),
    ],
    pathByteLimits: {
      ...PATH_BYTE_LIMITS,
      ...(overrides.pathByteLimits ?? {}),
    },
    maxTotalJsonSourceBytes:
      overrides.maxTotalJsonSourceBytes ?? 100_663_296,
    utf8DecodeChunkBytes: overrides.utf8DecodeChunkBytes ?? 262_144,
    maxJsonSourceCount: overrides.maxJsonSourceCount ?? 9,
  });
}

export function isWriterProjectJsonSourcePath(
  path: string,
  policy: WriterProjectJsonSourcePolicyV1 = WRITER_PROJECT_JSON_SOURCE_POLICY_V1,
): path is WriterProjectJsonSourcePath {
  return policy.jsonSourceCatalog.includes(path as WriterProjectJsonSourcePath);
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
