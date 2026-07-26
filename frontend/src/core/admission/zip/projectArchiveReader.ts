import type JSZip from 'jszip';

export interface ProjectArchiveReader {
  has(path: string): boolean;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  listPaths(): readonly string[];
}

export class ProjectArchiveUtf8Error extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Writer project member "${path}" is not valid UTF-8.`);
    this.name = 'ProjectArchiveUtf8Error';
    this.path = path;
  }
}

export class JSZipProjectArchiveReader implements ProjectArchiveReader {
  private readonly paths: readonly string[];

  constructor(private readonly zip: JSZip) {
    this.paths = Object.freeze(Object.keys(zip.files).sort());
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const file = this.zip.file(path);
    if (!file) throw new Error(`Archive missing file: ${path}`);
    return new Uint8Array(await file.async('uint8array'));
  }

  async readText(path: string): Promise<string> {
    return decodeProjectArchiveUtf8(await this.readBytes(path), path);
  }

  listPaths(): readonly string[] {
    return this.paths;
  }
}

export function decodeProjectArchiveUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ProjectArchiveUtf8Error(path);
  }
}
