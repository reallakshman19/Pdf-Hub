import { describe, expect, it, vi } from 'vitest';
import {
  DocumentEvidenceClientError,
  XmlCompareDocumentEvidenceClient,
} from './client';

describe('adapters/document-evidence/client error and validation paths', () => {
  it('validates constructor baseUrl and discoverTables sourcePath', async () => {
    expect(() => new XmlCompareDocumentEvidenceClient('   ')).toThrow(DocumentEvidenceClientError);

    const client = new XmlCompareDocumentEvidenceClient('https://evidence.local///', vi.fn());
    await expect(client.discoverTables({ sourcePath: '  ' })).rejects.toMatchObject({
      code: 'TABLE_SOURCE_PATH_REQUIRED',
    });
  });

  it('wraps transport errors, invalid JSON responses, and HTTP error payloads', async () => {
    const netClient = new XmlCompareDocumentEvidenceClient('https://evidence.local', async () => {
      throw new Error('socket hangup');
    });
    await expect(netClient.discoverTables({ sourcePath: 'a.pdf' })).rejects.toMatchObject({
      code: 'EVIDENCE_TRANSPORT_FAILED',
      message: 'socket hangup',
    });

    const badJsonClient = new XmlCompareDocumentEvidenceClient('https://evidence.local', async () =>
      new Response('not-json', { status: 502 }),
    );
    await expect(badJsonClient.discoverTables({ sourcePath: 'a.pdf' })).rejects.toMatchObject({
      code: 'EVIDENCE_RESPONSE_JSON_INVALID',
      status: 502,
    });

    const structuredErrClient = new XmlCompareDocumentEvidenceClient('https://evidence.local', async () =>
      new Response(JSON.stringify({ error: { message: 'Missing file' } }), { status: 404 }),
    );
    await expect(structuredErrClient.discoverTables({ sourcePath: 'a.pdf' })).rejects.toMatchObject({
      code: 'EVIDENCE_HTTP_ERROR',
      status: 404,
      message: 'Missing file',
    });

    const genericErrClient = new XmlCompareDocumentEvidenceClient('https://evidence.local', async () =>
      new Response(JSON.stringify({ detail: 'bad' }), { status: 500 }),
    );
    await expect(genericErrClient.discoverTables({ sourcePath: 'a.pdf' })).rejects.toMatchObject({
      code: 'EVIDENCE_HTTP_ERROR',
      status: 500,
      message: 'Document evidence request failed with HTTP 500',
    });
  });

  it('forwards explicit extractTables options with defaults when omitted', async () => {
    const validHash = `sha256:${'a'.repeat(64)}` as const;
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({
        schema: 'DocumentEvidenceTableExtraction.v1',
        sourceHash: validHash,
        source: {
          schema: 'SourceIdentity.v1',
          sourceId: 'src-1',
          sha256: validHash,
          mediaType: 'application/pdf',
          sizeBytes: 1024,
        },
        pages: [1],
        tables: [],
        diagnostics: [],
        options: { ocr: 'never', ocrLanguage: 'eng' },
      }), { status: 200 }),
    );
    const client = new XmlCompareDocumentEvidenceClient('https://evidence.local', fetchMock);
    const result = await client.extractTables({
      sourcePath: 'doc.pdf',
      sourceHash: validHash,
      pages: [1],
    });
    expect(result.sourceHash).toBe(validHash);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      options: { ocr: 'never', ocrLanguage: 'eng' },
    });
  });
});
