import {
  ProjectArchiveUtf8Error,
  decodeProjectArchiveUtf8,
  type ProjectArchiveReader,
} from './projectArchiveReader';
import {
  ZipBoundedExtractionError,
  rejectZipExtractionEvidence,
  type ZipBoundedExtractionEvidence,
  type ZipMemberClassification,
} from './zipExtractionEvidence';

export interface BoundedZipMember {
  readonly ordinal: number;
  readonly path: string;
  readonly compressionMethod: 0 | 8;
  readonly declaredCompressedBytes: number;
  readonly declaredUncompressedBytes: number;
  readonly actualExpandedBytes: number;
  readonly declaredCrc32: number;
  readonly actualCrc32: number;
  readonly bytes: Uint8Array;
}

export type BoundedZipMemberMetadata = Omit<BoundedZipMember, 'bytes'>;

interface BoundedZipMemberRegistry {
  readonly byPath: Map<string, BoundedZipMember>;
  readonly paths: readonly string[];
}

const registry = new WeakMap<BoundedZipMemberSet, BoundedZipMemberRegistry>();

export class BoundedZipMemberSet {
  readonly members: readonly BoundedZipMemberMetadata[];
  readonly evidence: ZipBoundedExtractionEvidence;

  private constructor(
    members: readonly BoundedZipMemberMetadata[],
    evidence: ZipBoundedExtractionEvidence,
  ) {
    this.members = Object.freeze(
      members.map((member) => Object.freeze({ ...member })),
    );
    this.evidence = evidence;
    Object.freeze(this);
  }

  static create(
    ownedMembers: readonly BoundedZipMember[],
    evidence: ZipBoundedExtractionEvidence,
  ): BoundedZipMemberSet {
    const byPath = new Map<string, BoundedZipMember>();
    const metadata: BoundedZipMemberMetadata[] = [];

    for (const member of ownedMembers) {
      byPath.set(member.path, member);
      metadata.push({
        ordinal: member.ordinal,
        path: member.path,
        compressionMethod: member.compressionMethod,
        declaredCompressedBytes: member.declaredCompressedBytes,
        declaredUncompressedBytes: member.declaredUncompressedBytes,
        actualExpandedBytes: member.actualExpandedBytes,
        declaredCrc32: member.declaredCrc32,
        actualCrc32: member.actualCrc32,
      });
    }

    const paths = Object.freeze([...byPath.keys()].sort());
    const memberSet = new BoundedZipMemberSet(metadata, evidence);
    registry.set(memberSet, { byPath, paths });
    return memberSet;
  }
}

export class BoundedZipMemberSetArchiveReader implements ProjectArchiveReader {
  private readonly memberSet: BoundedZipMemberSet;

  constructor(memberSet: BoundedZipMemberSet) {
    this.memberSet = memberSet;
  }

  has(path: string): boolean {
    return getRegistry(this.memberSet).byPath.has(path);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const member = getRegistry(this.memberSet).byPath.get(path);
    if (!member) throw new Error(`Archive missing file: ${path}`);
    return Uint8Array.from(member.bytes);
  }

  async readText(path: string): Promise<string> {
    try {
      return decodeProjectArchiveUtf8(await this.readBytes(path), path);
    } catch (error) {
      if (!(error instanceof ProjectArchiveUtf8Error)) throw error;
      const member = this.memberSet.members.find(
        (candidate) => candidate.path === path,
      );
      const evidence = rejectZipExtractionEvidence(
        this.memberSet.evidence,
        'REJECTED_UTF8',
        Object.freeze({
          severity: 'error' as const,
          code: 'ZIP_MEMBER_UTF8_INVALID',
          message: error.message,
          entryOrdinals: Object.freeze(member ? [member.ordinal] : []),
        }),
      );
      throw new ZipBoundedExtractionError(evidence, error.message);
    }
  }

  listPaths(): readonly string[] {
    return getRegistry(this.memberSet).paths;
  }
}

export function releaseBoundedZipMemberSet(memberSet: BoundedZipMemberSet): void {
  const state = registry.get(memberSet);
  if (state) state.byPath.clear();
  registry.delete(memberSet);
}

export function classifyZipMember(path: string): ZipMemberClassification {
  if (
    path === 'manifest.json' ||
    path === 'original.pdf' ||
    path === 'writer-elements.json' ||
    path === 'writer-assets.json' ||
    path === 'writer-document-meta.json'
  ) {
    return 'KNOWN_PROJECT_MEMBER';
  }
  if (path.startsWith('assets/')) return 'ASSET_MEMBER';
  if (path.startsWith('ocr/')) return 'OCR_COMPATIBILITY_MEMBER';
  return 'UNCLASSIFIED_MEMBER_POLICY_DEFERRED';
}

function getRegistry(memberSet: BoundedZipMemberSet): BoundedZipMemberRegistry {
  const state = registry.get(memberSet);
  if (!state) throw new Error('Bounded ZIP member set is no longer available.');
  return state;
}
