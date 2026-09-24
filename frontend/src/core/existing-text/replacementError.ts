import type {
  ExistingTextReplacementErrorCode,
} from './replacementTypes';

export class ExistingTextReplacementError
  extends Error {
  readonly code:
    ExistingTextReplacementErrorCode;
  readonly details?:
    readonly string[];

  constructor(
    code:
      ExistingTextReplacementErrorCode,
    message: string,
    details?: readonly string[],
  ) {
    super(message);
    this.name =
      'ExistingTextReplacementError';
    this.code = code;
    this.details = details
      ? [...details]
      : undefined;
  }
}
