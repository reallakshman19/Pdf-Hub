import { throwIfAborted } from '@/core/cancellation/operationCancellation';

/**
 * Final cancellation checkpoint used by admission coordinators immediately
 * before delegating to an existing repository commit boundary.
 *
 * Admission does not own a parallel transaction state machine. PDF commands,
 * session opening, Writer hydration, and OCR hydration retain their established
 * commit and rollback authorities.
 */
export function assertAdmissionCommitAllowed(
  signal: AbortSignal | undefined,
  operation: string,
): void {
  throwIfAborted(signal, operation);
}
