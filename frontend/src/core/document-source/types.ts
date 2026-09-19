export type DocumentSourceKind =
  | 'memory'
  | 'browser-file'
  | 'file-system-handle'
  | 'opfs'
  | 'remote-range';

export interface DocumentSourceCapabilities {
  /** Source can read arbitrary byte ranges without sequential cursor state. */
  readonly randomAccess: boolean;
  /** Each read returns bytes owned by the caller, never a mutable source view. */
  readonly immutableReads: boolean;
  /** Source contents can survive the current page/session lifecycle. */
  readonly persistent: boolean;
}

export interface DocumentSource {
  readonly id: string;
  readonly kind: DocumentSourceKind;
  readonly capabilities: Readonly<DocumentSourceCapabilities>;

  size(): Promise<number>;

  /**
   * Read exactly `length` bytes starting at zero-based `offset`.
   *
   * Implementations reject invalid/out-of-bounds ranges rather than silently
   * clamping. A zero-length read is valid for any offset in [0, size].
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}
