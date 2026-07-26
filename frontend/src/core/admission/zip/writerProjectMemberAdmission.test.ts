import { describe, expect, it } from 'vitest';
import { buildRawZipFixture, type RawZipFixtureEntry } from './__tests__/zipFixtureBuilder';
import { admitZipArchive } from './zipAdmission';
import { inspectZipArchive } from './zipInventory';
import {
  admitWriterProjectMembers,
  admitWriterProjectMembersForTest,
  type WriterProjectMemberAdmissionOperation,
} from './writerProjectMemberAdmission';
import { WriterProjectMemberAdmissionError } from './writerProjectMemberEvidence';
import { createWriterProjectMemberProfileForTest } from './writerProjectMemberProfile';

const REQUIRED = [
  { name: 'manifest.json' },
  { name: 'writer-elements.json' },
  { name: 'writer-assets.json' },
] as const;

const OCR_FILES = [
  'ocr/manifest.json',
  'ocr/result.json',
  'ocr/corrections.json',
  'ocr/regions.json',
  'ocr/writer-insertion-queue.json',
] as const;

describe('static Writer project member admission', () => {
  it('admits all required root members and records required roles by ordinal', () => {
    const result = admit(REQUIRED);

    expect(result.evidence.admissionOutcome).toBe('ADMITTED');
    expect(result.evidence.requiredRoleStatus).toEqual([
      { role: 'manifest.json', present: true, ordinal: 0 },
      { role: 'writer-elements.json', present: true, ordinal: 1 },
      { role: 'writer-assets.json', present: true, ordinal: 2 },
    ]);
    expect(result.evidence.memberRecords.map((record) => record.classification)).toEqual([
      'REQUIRED_ROOT_MEMBER',
      'REQUIRED_ROOT_MEMBER',
      'REQUIRED_ROOT_MEMBER',
    ]);
  });

  it.each([
    ['manifest.json', [REQUIRED[1], REQUIRED[2]]],
    ['writer-elements.json', [REQUIRED[0], REQUIRED[2]]],
    ['writer-assets.json', [REQUIRED[0], REQUIRED[1]]],
  ] as const)('rejects a missing required member: %s', (missing, entries) => {
    const evidence = rejected(entries);

    expect(evidence.admissionOutcome).toBe('REJECTED_REQUIRED_MEMBER_MISSING');
    expect(evidence.diagnostics[0]?.message).toContain(missing);
  });

  it('does not allow a directory entry to satisfy a required regular-file role', () => {
    const evidence = rejected([
      { name: 'manifest.json', externalAttributes: 0x10 },
      REQUIRED[1],
      REQUIRED[2],
    ]);

    expect(evidence.admissionOutcome).toBe('REJECTED_MEMBER_KIND');
    expect(evidence.memberRecords[0]).toMatchObject({
      classification: 'REQUIRED_ROOT_MEMBER',
      directory: true,
      admissionOutcome: 'REJECTED_MEMBER_KIND',
    });
    expect(evidence.requiredRoleStatus[0]).toEqual({
      role: 'manifest.json',
      present: false,
    });
  });

  it('admits optional root files without making original.pdf statically required', () => {
    const withoutOptional = admit(REQUIRED);
    const withOriginal = admit([...REQUIRED, { name: 'original.pdf' }]);
    const withMeta = admit([...REQUIRED, { name: 'writer-document-meta.json' }]);

    expect(withoutOptional.evidence.optionalRoleStatus).toEqual([
      { role: 'original.pdf', present: false },
      { role: 'writer-document-meta.json', present: false },
    ]);
    expect(withOriginal.evidence.optionalRoleStatus[0]).toMatchObject({
      present: true,
    });
    expect(withMeta.evidence.optionalRoleStatus[1]).toMatchObject({
      present: true,
    });
  });

  it('rejects incorrectly cased and normalized-alias fixed members', () => {
    expect(rejected([...REQUIRED, { name: 'Original.pdf' }]).admissionOutcome).toBe(
      'REJECTED_UNKNOWN_MEMBER',
    );
    expect(
      rejected([
        { name: './manifest.json' },
        REQUIRED[1],
        REQUIRED[2],
      ]).admissionOutcome,
    ).toBe('REJECTED_UNKNOWN_MEMBER');
  });

  it.each([
    'debug.json',
    'notes.txt',
    'backup/project.zip',
    '__MACOSX/metadata',
    'future-member.bin',
  ])('rejects unknown member %s', (path) => {
    const evidence = rejected([...REQUIRED, { name: path }]);

    expect(evidence.admissionOutcome).toBe('REJECTED_UNKNOWN_MEMBER');
    expect(evidence.unknownMemberCount).toBe(1);
    expect(evidence.memberRecords.at(-1)?.classification).toBe('UNKNOWN_MEMBER');
  });

  it('admits direct asset files and the exact assets directory marker', () => {
    const result = admit([
      ...REQUIRED,
      { name: 'assets/' },
      { name: 'assets/image.png' },
      { name: 'assets/file.bin' },
    ]);

    expect(result.evidence.assetMemberCount).toBe(2);
    expect(result.evidence.classificationCounts.ASSET_DIRECTORY).toBe(1);
    expect(result.evidence.memberRecords.slice(3).map((record) => record.classification)).toEqual([
      'ASSET_DIRECTORY',
      'ASSET_MEMBER',
      'ASSET_MEMBER',
    ]);
  });

  it.each([
    ['Assets/image.png', 'REJECTED_UNKNOWN_MEMBER'],
    ['asset/image.png', 'REJECTED_UNKNOWN_MEMBER'],
    ['assets/nested/image.png', 'REJECTED_INVALID_ASSET_NAMESPACE'],
    ['assets2/image.png', 'REJECTED_UNKNOWN_MEMBER'],
    ['assets//image.png', 'REJECTED_INVALID_ASSET_NAMESPACE'],
    ['assets/. ', 'REJECTED_INVALID_ASSET_NAMESPACE'],
  ] as const)('rejects invalid asset placement %s', (path, outcome) => {
    expect(rejected([...REQUIRED, { name: path }]).admissionOutcome).toBe(outcome);
  });

  it('admits the complete finite OCR catalog and allows no OCR members', () => {
    const withoutOcr = admit(REQUIRED);
    const withOcr = admit([
      ...REQUIRED,
      { name: 'ocr/' },
      ...OCR_FILES.map((name) => ({ name })),
    ]);

    expect(withoutOcr.evidence.ocrCompatibilityMemberCount).toBe(0);
    expect(withOcr.evidence.ocrCompatibilityMemberCount).toBe(OCR_FILES.length);
    expect(withOcr.evidence.classificationCounts.OCR_DIRECTORY).toBe(1);
  });

  it.each([
    ['ocr/future-data.json', 'REJECTED_INVALID_OCR_NAMESPACE'],
    ['ocr/private/debug.bin', 'REJECTED_INVALID_OCR_NAMESPACE'],
    ['Ocr/manifest.json', 'REJECTED_UNKNOWN_MEMBER'],
  ] as const)('rejects invalid OCR member %s', (path, outcome) => {
    expect(rejected([...REQUIRED, { name: path }]).admissionOutcome).toBe(outcome);
  });

  it('admits only exact profile directory markers', () => {
    expect(admit([...REQUIRED, { name: 'assets/' }]).evidence.admissionOutcome).toBe(
      'ADMITTED',
    );
    expect(rejected([...REQUIRED, { name: 'debug/' }]).admissionOutcome).toBe(
      'REJECTED_UNEXPECTED_DIRECTORY',
    );
  });

  it('reports member placement failures before missing required roles', () => {
    const evidence = rejected([
      { name: 'debug.json' },
      { name: 'writer-elements.json' },
      { name: 'writer-assets.json' },
    ]);

    expect(evidence.admissionOutcome).toBe('REJECTED_UNKNOWN_MEMBER');
    expect(evidence.diagnostics[0]?.code).toBe('WRITER_PROJECT_UNKNOWN_MEMBER');
    expect(evidence.diagnostics.some((diagnostic) =>
      diagnostic.code === 'WRITER_PROJECT_REQUIRED_MEMBER_MISSING')).toBe(false);
  });

  it('produces deterministic ordering, counts, diagnostics, and serialization', () => {
    const entries = [
      ...REQUIRED,
      { name: 'assets/' },
      { name: 'assets/a.bin' },
      { name: 'ocr/' },
      { name: OCR_FILES[0] },
    ];
    const first = admit(entries).evidence;
    const second = admit(entries).evidence;

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.memberRecords.map((record) => record.ordinal)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('deeply freezes evidence, records, counts, and role status', () => {
    const evidence = admit([...REQUIRED, { name: 'assets/image.png' }]).evidence;

    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.memberRecords)).toBe(true);
    expect(Object.isFrozen(evidence.memberRecords[0])).toBe(true);
    expect(Object.isFrozen(evidence.classificationCounts)).toBe(true);
    expect(Object.isFrozen(evidence.requiredRoleStatus)).toBe(true);
    expect(Object.isFrozen(evidence.requiredRoleStatus[0])).toBe(true);
  });

  it('checks operation currency during ordinal classification', () => {
    let checks = 0;
    const operation: WriterProjectMemberAdmissionOperation = {
      operationId: 'member-admission-cancel',
      generation: 1,
      isMounted: () => true,
      isCurrent: () => {
        checks += 1;
        return checks < 5;
      },
    };

    const evidence = rejected(REQUIRED, operation);
    expect(evidence.admissionOutcome).toBe('STALE_OPERATION');
    expect(evidence.memberRecords.length).toBeGreaterThan(0);
    expect(evidence.cancellationStage).toContain('member ordinal');
  });

  it('supports a reduced injected profile for focused fixtures only', () => {
    const profile = createWriterProjectMemberProfileForTest({
      requiredRootFiles: ['manifest.json'],
      optionalRootFiles: [],
      allowedDirectoryMarkers: [],
      ocrCompatibilityFiles: [],
    });
    const inventory = inventoryFor([{ name: 'manifest.json' }]);

    expect(
      admitWriterProjectMembersForTest(inventory, profile).evidence.admissionOutcome,
    ).toBe('ADMITTED');
  });
});

function admit(
  entries: readonly RawZipFixtureEntry[],
  operation?: WriterProjectMemberAdmissionOperation,
) {
  return admitWriterProjectMembers(inventoryFor(entries), operation);
}

function rejected(
  entries: readonly RawZipFixtureEntry[],
  operation?: WriterProjectMemberAdmissionOperation,
) {
  try {
    admit(entries, operation);
    throw new Error('Expected member admission to reject.');
  } catch (error) {
    if (!(error instanceof WriterProjectMemberAdmissionError)) throw error;
    return error.evidence;
  }
}

function inventoryFor(entries: readonly RawZipFixtureEntry[]) {
  return admitZipArchive(inspectZipArchive(buildRawZipFixture(entries).bytes));
}
