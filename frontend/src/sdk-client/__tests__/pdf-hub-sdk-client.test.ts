import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS,
  PDF_HUB_SDK_CLIENT_VERSION,
  PdfHubSdkClientError,
  connectPdfHubSdk,
  isPdfHubSdkApiVersionSupported,
  negotiatePdfHubSdkApiVersion,
} from '../pdf-hub-sdk-client';

function createHost(
  apiVersion = '1',
  capabilitiesVersion =
    apiVersion,
) {
  return {
    apiVersion,
    getCapabilities: vi.fn(
      () => ({
        apiVersion:
          capabilitiesVersion,
        events: true,
      }),
    ),
    inspectSession: vi.fn(),
    getWorkingPdfBytes: vi.fn(),
    admitDonors: vi.fn(),
    releaseDonorAdmission: vi.fn(),
    executeCommand: vi.fn(),
    subscribeSession: vi.fn(),
    subscribeEvents: vi.fn(),
    marker: 'typed-host',
  };
}

function setGlobalHost(
  host: unknown,
): void {
  (
    globalThis as {
      PDFHubSDK?: unknown;
    }
  ).PDFHubSDK = host;
}

function clearGlobalHost(): void {
  delete (
    globalThis as {
      PDFHubSDK?: unknown;
    }
  ).PDFHubSDK;
}

describe('PDF Hub SDK host client', () => {
  afterEach(() => {
    clearGlobalHost();
    vi.restoreAllMocks();
  });

  it('declares immutable client-supported API versions', () => {
    expect(
      PDF_HUB_SDK_CLIENT_VERSION,
    ).toBe('1.0.0');
    expect(
      PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS,
    ).toEqual(['1']);
    expect(
      Object.isFrozen(
        PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS,
      ),
    ).toBe(true);
    expect(
      isPdfHubSdkApiVersionSupported(
        '1',
      ),
    ).toBe(true);
    expect(
      isPdfHubSdkApiVersionSupported(
        '2',
      ),
    ).toBe(false);
  });

  it('connects to an explicitly injected v1 host and preserves host identity', () => {
    const host = createHost();

    const connection =
      connectPdfHubSdk({
        host,
      });

    expect(connection.apiVersion)
      .toBe('1');
    expect(connection.sdk)
      .toBe(host);
    expect(connection.sdk.marker)
      .toBe('typed-host');
    expect(connection.capabilities)
      .toMatchObject({
        apiVersion: '1',
        events: true,
      });
    expect(
      Object.isFrozen(
        connection.capabilities,
      ),
    ).toBe(true);
  });

  it('discovers the installed global host when no explicit host is supplied', () => {
    const host = createHost();
    setGlobalHost(host);

    const connection =
      connectPdfHubSdk();

    expect(connection.sdk)
      .toBe(host);
    expect(connection.apiVersion)
      .toBe('1');
  });

  it('fails with HOST_UNAVAILABLE when no host exists', () => {
    expect(() =>
      connectPdfHubSdk(),
    ).toThrow(
      expect.objectContaining({
        code: 'HOST_UNAVAILABLE',
      }),
    );
  });

  it('rejects malformed hosts before version negotiation', () => {
    const host = createHost();
    const malformed = {
      ...host,
      executeCommand:
        undefined,
    };

    let thrown: unknown;
    try {
      connectPdfHubSdk({
        host:
          malformed as never,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown)
      .toBeInstanceOf(
        PdfHubSdkClientError,
      );
    expect(thrown)
      .toMatchObject({
        code: 'INVALID_HOST',
      });
  });

  it('requires host and capability API versions to agree', () => {
    const host =
      createHost('1', '2');

    expect(() =>
      connectPdfHubSdk({
        host,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_HOST',
      }),
    );
  });

  it('rejects unsupported host API versions', () => {
    const host = createHost('2');

    expect(() =>
      connectPdfHubSdk({
        host,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'VERSION_MISMATCH',
      }),
    );
  });

  it('respects caller accepted API versions', () => {
    const host = createHost();

    expect(() =>
      connectPdfHubSdk({
        host,
        acceptedApiVersions: [
          '2',
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'VERSION_MISMATCH',
      }),
    );

    expect(
      negotiatePdfHubSdkApiVersion(
        '1',
        ['1', '2'],
      ),
    ).toBe('1');
  });

  it('rejects invalid accepted-version options', () => {
    let thrown: unknown;
    try {
      connectPdfHubSdk({
        acceptedApiVersions:
          [],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown)
      .toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
  });

  it('wraps getCapabilities failures as INVALID_HOST', () => {
    const host = createHost();
    host.getCapabilities
      .mockImplementation(
        () => {
          throw new Error(
            'capability failure',
          );
        },
      );

    let thrown: unknown;
    try {
      connectPdfHubSdk({
        host,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown)
      .toMatchObject({
        code: 'INVALID_HOST',
        details: [
          'capability failure',
        ],
      });
  });
});
