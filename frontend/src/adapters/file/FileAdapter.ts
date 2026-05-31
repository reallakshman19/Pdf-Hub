import { log, error, warn } from '@/core/logger/service';

export interface PickedPdfFile {
  name: string;
  bytes: Uint8Array;
  handle?: FileSystemFileHandle;
}

interface PermissionCapableFileHandle extends FileSystemFileHandle {
  queryPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  }
}

export class FileAdapter {
  private static readonly MAX_SIZE_MB = 100;
  private static readonly MAX_SIZE_BYTES = this.MAX_SIZE_MB * 1024 * 1024;

  static async hashBytes(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', this.toArrayBuffer(bytes));
    const hash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hash}`;
  }

  static async pickPdfFiles(multiple: boolean): Promise<PickedPdfFile[]> {
    try {
      if (window.isSecureContext && window.showOpenFilePicker) {
        const handles = await window.showOpenFilePicker({
          multiple,
          types: [
            {
              description: 'PDF Documents',
              accept: { 'application/pdf': ['.pdf'] },
            },
          ],
          excludeAcceptAllOption: false,
        });

        const files = await Promise.all(
          handles.map((handle) => this.readPickedHandle(handle)),
        );

        log('session', 'Files selected via File System Access API', { count: files.length });
        return files;
      }

      return await this.pickViaInput(multiple);
    } catch (err) {
      if (this.isHandleAccessError(err)) {
        warn('session', 'File handle read failed, falling back to input picker', {
          error: String(err),
        });
        return await this.pickViaInput(multiple);
      }
      error('system', 'File selection failed', { error: String(err) });
      throw err;
    }
  }

  static async savePdfBytes(
    bytes: Uint8Array,
    suggestedName: string,
    existingHandle: FileSystemFileHandle | null,
  ): Promise<FileSystemFileHandle | null> {
    try {
      if (existingHandle) {
        await this.writeHandle(existingHandle, bytes);
        log('session', 'PDF saved to existing handle', { fileName: suggestedName, size: bytes.byteLength });
        return existingHandle;
      }

      if (window.isSecureContext && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'PDF Document',
              accept: { 'application/pdf': ['.pdf'] },
            },
          ],
          excludeAcceptAllOption: false,
        });

        await this.writeHandle(handle, bytes);
        log('session', 'PDF saved via File System Access API', { fileName: suggestedName, size: bytes.byteLength });
        return handle;
      }

      this.downloadBytes(bytes, suggestedName);
      return null;
    } catch (err) {
      error('system', 'Save failed', { fileName: suggestedName, error: String(err) });
      throw err;
    }
  }

  static downloadBytes(bytes: Uint8Array, name: string): void {
    const blob = new Blob([this.toArrayBuffer(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    log('session', 'PDF downloaded', { fileName: name, size: bytes.byteLength });
  }

  private static async writeHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(this.toArrayBuffer(bytes));
    await writable.close();
  }

  private static toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const sliced = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (sliced instanceof ArrayBuffer) {
      return sliced;
    }
    return Uint8Array.from(bytes).buffer;
  }

  private static async pickViaInput(multiple: boolean): Promise<PickedPdfFile[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,.pdf';
      input.multiple = multiple;

      input.onchange = async () => {
        try {
          const selectedFiles = Array.from(input.files ?? []);
          const files = await Promise.all(
            selectedFiles.map(async (file) => {
              this.assertPdfFile(file);
              return {
                name: file.name,
                bytes: new Uint8Array(await file.arrayBuffer()),
              };
            }),
          );
          log('session', 'Files selected via input fallback', { count: files.length });
          resolve(files);
        } catch (err) {
          reject(err);
        }
      };

      input.onerror = () => reject(new Error('Unable to open file input'));
      input.click();
    });
  }

  private static assertPdfFile(file: File): void {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Invalid file type: ${file.type || 'unknown'}`);
    }
    if (file.size > this.MAX_SIZE_BYTES) {
      throw new Error(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max allowed is ${this.MAX_SIZE_MB}MB.`,
      );
    }
  }

  private static async readPickedHandle(handle: FileSystemFileHandle): Promise<PickedPdfFile> {
    try {
      return await this.readPickedHandleOnce(handle);
    } catch (err) {
      if (!this.isHandleAccessError(err)) {
        throw err;
      }

      const permission = await this.requestReadPermission(handle);
      if (permission !== 'granted') {
        throw err;
      }

      return await this.readPickedHandleOnce(handle);
    }
  }

  private static async readPickedHandleOnce(handle: FileSystemFileHandle): Promise<PickedPdfFile> {
    const file = await handle.getFile();
    this.assertPdfFile(file);
    return {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      handle,
    };
  }

  private static isHandleAccessError(err: unknown): boolean {
    if (!(err instanceof DOMException)) {
      return false;
    }
    return err.name === 'NotReadableError' || err.name === 'NotAllowedError' || err.name === 'NotFoundError';
  }

  private static async requestReadPermission(
    handle: FileSystemFileHandle,
  ): Promise<PermissionState> {
    const permissionHandle = handle as PermissionCapableFileHandle;
    if (
      typeof permissionHandle.queryPermission !== 'function' ||
      typeof permissionHandle.requestPermission !== 'function'
    ) {
      return 'prompt';
    }

    const query = await permissionHandle.queryPermission({ mode: 'read' });
    if (query === 'granted') {
      return query;
    }

    return await permissionHandle.requestPermission({ mode: 'read' });
  }
}
