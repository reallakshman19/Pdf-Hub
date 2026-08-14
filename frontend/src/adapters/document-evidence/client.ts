import {
  assertExplicitExtractionInput,
  DocumentEvidenceContractError,
  parseTableDiscovery,
  parseTableExtraction,
} from '../../core/document-evidence/guards';
import type {
  DiscoverTablesRequest,
  ExtractTablesRequest,
  TableDiscovery,
  TableExtraction,
} from '../../core/document-evidence/types';

export class DocumentEvidenceClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'DocumentEvidenceClientError';
    this.code = code;
    this.status = status;
  }
}

export class XmlCompareDocumentEvidenceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    if (baseUrl.trim().length === 0) {
      throw new DocumentEvidenceClientError('EVIDENCE_BASE_URL_REQUIRED', 'baseUrl must be non-empty');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async discoverTables(input: DiscoverTablesRequest): Promise<TableDiscovery> {
    if (input.sourcePath.trim().length === 0) {
      throw new DocumentEvidenceClientError('TABLE_SOURCE_PATH_REQUIRED', 'sourcePath must be non-empty');
    }
    const payload = await this.post('/v2/tables/discover', { sourcePath: input.sourcePath }, input.signal);
    return parseTableDiscovery(payload);
  }

  async extractTables(input: ExtractTablesRequest): Promise<TableExtraction> {
    assertExplicitExtractionInput(input);
    const options = {
      ocr: input.options?.ocr ?? 'never',
      ocrLanguage: input.options?.ocrLanguage ?? 'eng',
    } as const;
    const payload = await this.post('/v2/tables/extract', {
      sourcePath: input.sourcePath,
      sourceHash: input.sourceHash,
      pages: [...input.pages],
      options,
    }, input.signal);
    return parseTableExtraction(payload, { sourceHash: input.sourceHash, pages: input.pages });
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new DocumentEvidenceClientError('EVIDENCE_TRANSPORT_FAILED', message(error));
    }
    const payload = await readJson(response);
    if (!response.ok) {
      throw new DocumentEvidenceClientError('EVIDENCE_HTTP_ERROR', httpMessage(payload, response.status), response.status);
    }
    return payload;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new DocumentEvidenceClientError('EVIDENCE_RESPONSE_JSON_INVALID', message(error), response.status);
  }
}

function httpMessage(value: unknown, status: number): string {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const text = (error as { message?: unknown }).message;
      if (typeof text === 'string' && text.length > 0) return text;
    }
  }
  return `Document evidence request failed with HTTP ${status}`;
}

function message(error: unknown): string {
  if (error instanceof DocumentEvidenceContractError || error instanceof Error) return error.message;
  return String(error);
}
