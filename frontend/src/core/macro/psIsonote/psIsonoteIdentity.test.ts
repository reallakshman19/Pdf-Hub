import { describe, expect, it } from 'vitest';
import type { MacroRecipe } from '@/core/macro/types';
import {
  computePsIsonoteMappingHash,
  computePsIsonoteOccurrenceId,
  createPsIsonoteAuditIdentity,
  hasLegacyPsIsonoteMarker,
  parseVersionedPsIsonoteMarkers,
  versionedMarkerForOccurrence,
} from './psIsonoteIdentity';
import type { PsIsonoteMapping } from './psIsonoteTable';

const INPUT_HASH = `sha256:${'a'.repeat(64)}`;

const mapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};

const recipe: MacroRecipe = {
  id: 'runtime-id-is-excluded',
  name: 'Annotate PS ISONOTEs',
  steps: [],
};

describe('psIsonoteIdentity', () => {
  it('hashes mapping semantics independently from source row', async () => {
    const first = await computePsIsonoteMappingHash(mapping);
    const movedRow = await computePsIsonoteMappingHash({ ...mapping, sourceRow: 200 });
    const changedNote = await computePsIsonoteMappingHash({ ...mapping, isonote: 'REST (20kN)' });

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(movedRow).toBe(first);
    expect(changedNote).not.toBe(first);
  });

  it('creates deterministic occurrence ids from geometry across PDF revisions', async () => {
    const options = {
      inputSha256: INPUT_HASH,
      pageNumber: 3,
      psNo: mapping.psNo,
      rect: { x: 10.1234, y: 20.5678, width: 60, height: 10 },
    };
    const first = await computePsIsonoteOccurrenceId(options);
    const second = await computePsIsonoteOccurrenceId({
      ...options,
      inputSha256: `sha256:${'b'.repeat(64)}`,
    });
    const moved = await computePsIsonoteOccurrenceId({
      ...options,
      rect: { ...options.rect, x: 12.1234 },
    });

    expect(second).toBe(first);
    expect(moved).not.toBe(first);
  });

  it('round-trips v2 markers without embedding a searchable PS reference', async () => {
    const mappingHash = await computePsIsonoteMappingHash(mapping);
    const occurrenceId = await computePsIsonoteOccurrenceId({
      inputSha256: INPUT_HASH,
      pageNumber: 1,
      psNo: mapping.psNo,
      rect: { x: 10, y: 20, width: 60, height: 10 },
    });
    const marker = versionedMarkerForOccurrence({
      psNo: mapping.psNo,
      mappingHash,
      occurrenceId,
    });
    const splitMarker = marker.replaceAll('|', ' | ');

    expect(marker).toContain('PDFHUBISONOTE[v2|1234.5|');
    expect(marker).not.toContain('|PS-1234.5|');
    expect(parseVersionedPsIsonoteMarkers(splitMarker)).toEqual([{
      raw: marker.toUpperCase(),
      psNo: mapping.psNo,
      mappingHash,
      occurrenceId,
    }]);
    expect(hasLegacyPsIsonoteMarker('PDFHUBISONOTE[1234.5]', mapping.psNo)).toBe(true);
  });

  it('builds a stable run id from input, mapping, recipe, and scope hashes', async () => {
    const options = {
      documentName: 'drawing.pdf',
      inputDocumentKey: INPUT_HASH,
      inputSha256: INPUT_HASH,
      sourceText: 'PS No.,ISONOTE\nPS-1234.5,REST (6kN)',
      recipe,
      scope: {
        selector: { mode: 'all' } as const,
        selectedPages: [],
        skipExisting: true,
        placement: 'auto' as const,
        noteWidth: 220,
        fontSize: 10,
        includeFamily: true,
      },
    };
    const first = await createPsIsonoteAuditIdentity(options);
    const second = await createPsIsonoteAuditIdentity(options);
    const changedScope = await createPsIsonoteAuditIdentity({
      ...options,
      scope: { ...options.scope, noteWidth: 240 },
    });

    expect(second.runId).toBe(first.runId);
    expect(second.recipeSha256).toBe(first.recipeSha256);
    expect(changedScope.runId).not.toBe(first.runId);
    expect(first.auditSchemaVersion).toBe('2');
    expect(first.markerSchemaVersion).toBe('v2');
  });
});
