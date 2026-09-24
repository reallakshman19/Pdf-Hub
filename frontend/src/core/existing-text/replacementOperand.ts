import type {
  ExistingTextSimpleStringEncoding,
} from './provenanceTypes';
import {
  ExistingTextReplacementError,
} from './replacementError';

export function encodeSimpleExistingTextReplacementOperand(
  encoding:
    ExistingTextSimpleStringEncoding,
  replacementText: string,
): Uint8Array {
  assertPrintableAsciiReplacement(
    replacementText,
  );

  const source =
    encoding === 'ascii-hex'
      ? `<${toUpperHex(
          replacementText,
        )}>`
      : `(${escapeLiteral(
          replacementText,
        )})`;

  return Uint8Array.from(
    Array.from(
      source,
      (character) =>
        character.charCodeAt(0),
    ),
  );
}

export function assertPrintableAsciiReplacement(
  replacementText: string,
): void {
  if (
    typeof replacementText
    !== 'string'
    || !/^[\x20-\x7e]*$/.test(
      replacementText,
    )
  ) {
    throw new ExistingTextReplacementError(
      'UNSUPPORTED_REPLACEMENT_TEXT',
      'Simple native replacement currently supports printable ASCII U+0020..U+007E only.',
    );
  }
}

function escapeLiteral(
  value: string,
): string {
  return value.replace(
    /[\\()]/g,
    (character) =>
      `\\${character}`,
  );
}

function toUpperHex(
  value: string,
): string {
  return Array.from(
    value,
    (character) =>
      character
        .charCodeAt(0)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0'),
  ).join('');
}
