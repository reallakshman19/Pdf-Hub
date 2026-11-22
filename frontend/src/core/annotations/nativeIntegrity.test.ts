import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from './types';
import {
  confirmedNativeDeletionCommandIds,
  type NativeDeletionTombstone,
} from './nativeIntegrity';

const revision = 'sha256:exact-original';
const annotation: PdfAnnotation = {
  id: 'native-note',
  type: 'comment',
  pageNumber: 1,
  pageId: 'source-page',
  rect: { x: 12, y: 20, width: 22, height: 22 },
  data: { nativeSourceRef: '12 0 R', text: 'Source review note' },
  createdAt: 1,
  updatedAt: 1,
};
const tombstone: NativeDeletionTombstone = {
  sourceRevision: revision,
  sourceRef: '12 0 R',
  sourceName: 'native-note',
  pageNumber: 1,
  pageId: 'source-page',
  commandId: 'user-action-delete-note',
};
const history = [{
  command: { id: tombstone.commandId, type: 'ANNOTATION_CHANGE', documentKey: revision },
  before: { annotations: [annotation] },
  after: { annotations: [], nativeDeletionTombstones: [tombstone] },
}];

describe('issued native deletion history attestation', () => {
  it('accepts the exact before→after user deletion command', () => {
    expect(confirmedNativeDeletionCommandIds([tombstone], history, revision))
      .toEqual([tombstone.commandId]);
  });

  it('does not authorize a well-formed tombstone copied or forged without its matching command', () => {
    const forged: NativeDeletionTombstone = {
      ...tombstone,
      sourceRef: '99 0 R',
      sourceName: 'another-native-note',
      commandId: 'plausible-but-not-issued',
    };
    expect(() => confirmedNativeDeletionCommandIds([forged], history, revision))
      .toThrow('not present in verified history');
  });

  it('rejects a history entry where the target was never removed', () => {
    const retained = [{
      ...history[0], after: { annotations: [annotation], nativeDeletionTombstones: [tombstone] },
    }];
    expect(() => confirmedNativeDeletionCommandIds([tombstone], retained, revision))
      .toThrow('not present in verified history');
  });

  it('rejects unrelated annotation commands and stale source revisions', () => {
    const unrelated = [{
      ...history[0],
      command: { ...history[0].command, type: 'ROTATE_PAGES' },
    }];
    expect(() => confirmedNativeDeletionCommandIds([tombstone], unrelated, revision))
      .toThrow('not present in verified history');
    expect(() => confirmedNativeDeletionCommandIds([tombstone], history, 'other-revision'))
      .toThrow('invalid user command');
  });
});
