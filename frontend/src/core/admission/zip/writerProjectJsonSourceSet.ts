import type { ProjectArchiveReader } from './projectArchiveReader';
import type { WriterProjectJsonSourceAdmissionEvidence } from './writerProjectJsonSourceEvidence';
import type { WriterProjectJsonSourcePath } from './writerProjectJsonSourcePolicy';

export interface AdmittedProjectJsonSource {
  readonly ordinal: number;
  readonly path: WriterProjectJsonSourcePath;
  readonly sourceBytes: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
}

interface AdmittedJsonSourceRegistry {
  readonly underlyingReader: ProjectArchiveReader;
  readonly decodedByPath: Map<WriterProjectJsonSourcePath, string>;
}

const registry = new WeakMap<
  AdmittedWriterProjectJsonSourceSet,
  AdmittedJsonSourceRegistry
>();

export class AdmittedWriterProjectJsonSourceSet {
  readonly sources: readonly AdmittedProjectJsonSource[];
  readonly evidence: WriterProjectJsonSourceAdmissionEvidence;
  readonly reader: ProjectArchiveReader;

  private constructor(
    sources: readonly AdmittedProjectJsonSource[],
    evidence: WriterProjectJsonSourceAdmissionEvidence,
  ) {
    this.sources = Object.freeze(
      sources.map((source) => Object.freeze({ ...source })),
    );
    this.evidence = evidence;
    this.reader = new JsonAdmittedProjectArchiveReader(this);
    Object.freeze(this);
  }

  static create(
    sources: readonly AdmittedProjectJsonSource[],
    decodedByPath: ReadonlyMap<WriterProjectJsonSourcePath, string>,
    underlyingReader: ProjectArchiveReader,
    evidence: WriterProjectJsonSourceAdmissionEvidence,
  ): AdmittedWriterProjectJsonSourceSet {
    const sourceSet = new AdmittedWriterProjectJsonSourceSet(sources, evidence);
    registry.set(sourceSet, {
      underlyingReader,
      decodedByPath: new Map(decodedByPath),
    });
    return sourceSet;
  }
}

export class JsonAdmittedProjectArchiveReader implements ProjectArchiveReader {
  private readonly sourceSet: AdmittedWriterProjectJsonSourceSet;

  constructor(sourceSet: AdmittedWriterProjectJsonSourceSet) {
    this.sourceSet = sourceSet;
  }

  has(path: string): boolean {
    return getRegistry(this.sourceSet).underlyingReader.has(path);
  }

  readBytes(path: string): Promise<Uint8Array> {
    return getRegistry(this.sourceSet).underlyingReader.readBytes(path);
  }

  async readText(path: string): Promise<string> {
    const state = getRegistry(this.sourceSet);
    const admitted = state.decodedByPath.get(path as WriterProjectJsonSourcePath);
    if (admitted === undefined) {
      throw new Error(
        `Writer project text member "${path}" was not admitted as a JSON source.`,
      );
    }
    return admitted;
  }

  listPaths(): readonly string[] {
    return getRegistry(this.sourceSet).underlyingReader.listPaths();
  }
}

export function releaseAdmittedProjectJsonSources(
  sourceSet: AdmittedWriterProjectJsonSourceSet,
): void {
  const state = registry.get(sourceSet);
  if (state) state.decodedByPath.clear();
  registry.delete(sourceSet);
}

function getRegistry(
  sourceSet: AdmittedWriterProjectJsonSourceSet,
): AdmittedJsonSourceRegistry {
  const state = registry.get(sourceSet);
  if (!state) {
    throw new Error('Admitted Writer project JSON sources are no longer available.');
  }
  return state;
}
