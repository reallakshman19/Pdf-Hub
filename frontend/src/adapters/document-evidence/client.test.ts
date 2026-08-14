import { describe, expect, it } from 'vitest';
import { XmlCompareDocumentEvidenceClient } from './client';

const H = `sha256:${'a'.repeat(64)}` as const;

function source() {
  return { schema: 'SourceIdentity.v1', sourceId: 'source:a', sha256: H, mediaType: 'application/pdf', sizeBytes: 10 };
}

function fakeFetch(payload: unknown, inspect?: (url: string, init?: RequestInit) => void): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    inspect?.(String(input), init);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

describe('XmlCompareDocumentEvidenceClient', () => {
  it('discovers advisory candidates through the canonical route', async () => {
    let body: unknown;
    const client = new XmlCompareDocumentEvidenceClient('http://127.0.0.1:8765/', fakeFetch({
      schema: 'DocumentEvidenceTableDiscovery.v1', sourceHash: H, source: source(), candidates: [], diagnostics: [],
    }, (url, init) => {
      expect(url).toBe('http://127.0.0.1:8765/v2/tables/discover');
      body = JSON.parse(String(init?.body));
    }));
    const result = await client.discoverTables({ sourcePath: 'controlled.pdf' });
    expect(body).toEqual({ sourcePath: 'controlled.pdf' });
    expect(result.candidates).toEqual([]);
  });

  it('requires explicit pages before governed extraction', async () => {
    const client = new XmlCompareDocumentEvidenceClient('http://127.0.0.1:8765', fakeFetch({}));
    await expect(client.extractTables({ sourcePath: 'controlled.pdf', sourceHash: H, pages: [] }))
      .rejects.toThrow(/explicit 1-based page/);
  });

  it('binds governed extraction to source hash and explicit pages', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const payload = {
      schema: 'DocumentEvidenceTableExtraction.v1', sourceHash: H, source: source(), pages: [2, 7],
      tables: [], diagnostics: [], options: { ocr: 'never', ocrLanguage: 'eng' },
    };
    const client = new XmlCompareDocumentEvidenceClient('http://127.0.0.1:8765', fakeFetch(payload, (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    }));
    const result = await client.extractTables({ sourcePath: 'controlled.pdf', sourceHash: H, pages: [7, 2] });
    expect(requestBody?.sourceHash).toBe(H);
    expect(requestBody?.pages).toEqual([7, 2]);
    expect(result.pages).toEqual([2, 7]);
  });
});
