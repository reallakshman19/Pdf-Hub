import { describe, expect, it } from 'vitest';
import {
  WRITER_PROJECT_MEMBER_PROFILE_V1,
  createWriterProjectMemberProfileForTest,
} from './writerProjectMemberProfile';

describe('WRITER_PROJECT_MEMBER_PROFILE_V1', () => {
  it('freezes the exact current Writer and OCR member catalogs', () => {
    expect(WRITER_PROJECT_MEMBER_PROFILE_V1).toEqual({
      profileId: 'WRITER_PROJECT_MEMBER_PROFILE_V1',
      authority: 'OWNER_APPROVED',
      requiredRootFiles: [
        'manifest.json',
        'writer-elements.json',
        'writer-assets.json',
      ],
      optionalRootFiles: [
        'original.pdf',
        'writer-document-meta.json',
      ],
      allowedDirectoryMarkers: ['assets/', 'ocr/'],
      assetNamespace: {
        root: 'assets/',
        directFilesOnly: true,
      },
      ocrCompatibilityFiles: [
        'ocr/manifest.json',
        'ocr/result.json',
        'ocr/corrections.json',
        'ocr/regions.json',
        'ocr/writer-insertion-queue.json',
      ],
    });

    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1.requiredRootFiles)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1.optionalRootFiles)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1.allowedDirectoryMarkers)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1.assetNamespace)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles)).toBe(true);
  });

  it('does not expose mutable catalogs to callers', () => {
    const required = WRITER_PROJECT_MEMBER_PROFILE_V1.requiredRootFiles as unknown as string[];
    const ocr = WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles as unknown as string[];

    expect(() => required.push('future.json')).toThrow();
    expect(() => ocr.splice(0, 1)).toThrow();
    expect(WRITER_PROJECT_MEMBER_PROFILE_V1.requiredRootFiles).toHaveLength(3);
    expect(WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles).toHaveLength(5);
  });

  it('supports a deeply frozen reduced profile for deterministic tests only', () => {
    const profile = createWriterProjectMemberProfileForTest({
      optionalRootFiles: [],
      allowedDirectoryMarkers: ['assets/'],
      ocrCompatibilityFiles: [],
    });

    expect(profile.optionalRootFiles).toEqual([]);
    expect(profile.allowedDirectoryMarkers).toEqual(['assets/']);
    expect(profile.ocrCompatibilityFiles).toEqual([]);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.allowedDirectoryMarkers)).toBe(true);
  });
});
