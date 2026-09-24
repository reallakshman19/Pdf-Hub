export const PDF_HUB_SDK_CLIENT_VERSION =
  '1.0.0' as const;

export const PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS =
  Object.freeze(['1'] as const);

export type PdfHubSdkClientVersion =
  typeof PDF_HUB_SDK_CLIENT_VERSION;

export type PdfHubSdkClientSupportedApiVersion =
  typeof PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS[number];

export type PdfHubSdkClientErrorCode =
  | 'HOST_UNAVAILABLE'
  | 'INVALID_HOST'
  | 'VERSION_MISMATCH'
  | 'INVALID_ARGUMENT';

export interface PdfHubSdkHostCapabilities {
  apiVersion: string;
  [key: string]: unknown;
}

export interface PdfHubSdkHost {
  readonly apiVersion: string;
  readonly getCapabilities: unknown;
  readonly inspectSession: unknown;
  readonly getWorkingPdfBytes: unknown;
  readonly admitDonors: unknown;
  readonly releaseDonorAdmission: unknown;
  readonly executeCommand: unknown;
  readonly subscribeSession: unknown;
  readonly subscribeEvents: unknown;
}

export interface PdfHubSdkConnectOptions<
  THost extends PdfHubSdkHost = PdfHubSdkHost,
> {
  host?: THost;
  acceptedApiVersions?: readonly string[];
}

export interface PdfHubSdkConnection<
  THost extends PdfHubSdkHost = PdfHubSdkHost,
> {
  readonly clientVersion:
    PdfHubSdkClientVersion;
  readonly apiVersion:
    PdfHubSdkClientSupportedApiVersion;
  readonly sdk: THost;
  readonly capabilities:
    Readonly<PdfHubSdkHostCapabilities>;
}

const REQUIRED_HOST_METHODS = Object.freeze([
  'getCapabilities',
  'inspectSession',
  'getWorkingPdfBytes',
  'admitDonors',
  'releaseDonorAdmission',
  'executeCommand',
  'subscribeSession',
  'subscribeEvents',
] as const);

export class PdfHubSdkClientError
  extends Error {
  readonly code:
    PdfHubSdkClientErrorCode;
  readonly details?: readonly string[];

  constructor(
    code: PdfHubSdkClientErrorCode,
    message: string,
    details?: readonly string[],
  ) {
    super(message);
    this.name =
      'PdfHubSdkClientError';
    this.code = code;
    this.details = details
      ? [...details]
      : undefined;
  }
}

export function isPdfHubSdkApiVersionSupported(
  version: unknown,
): version is PdfHubSdkClientSupportedApiVersion {
  return (
    typeof version === 'string'
    && (
      PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS
        as readonly string[]
    ).includes(version)
  );
}

export function negotiatePdfHubSdkApiVersion(
  hostVersion: unknown,
  acceptedApiVersions:
    readonly string[]
    = PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS,
): PdfHubSdkClientSupportedApiVersion {
  assertAcceptedVersions(
    acceptedApiVersions,
  );

  if (
    !isPdfHubSdkApiVersionSupported(
      hostVersion,
    )
  ) {
    throw new PdfHubSdkClientError(
      'VERSION_MISMATCH',
      `PDF Hub host API version ${String(hostVersion)} is not supported by client ${PDF_HUB_SDK_CLIENT_VERSION}.`,
      [
        `client-supported=${PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS.join(',')}`,
        `host=${String(hostVersion)}`,
      ],
    );
  }

  if (
    !acceptedApiVersions.includes(
      hostVersion,
    )
  ) {
    throw new PdfHubSdkClientError(
      'VERSION_MISMATCH',
      `PDF Hub host API version ${hostVersion} is not accepted by this integration.`,
      [
        `accepted=${acceptedApiVersions.join(',')}`,
        `host=${hostVersion}`,
      ],
    );
  }

  return hostVersion;
}

export function connectPdfHubSdk<
  THost extends PdfHubSdkHost = PdfHubSdkHost,
>(
  options:
    PdfHubSdkConnectOptions<THost>
    = {},
): PdfHubSdkConnection<THost> {
  assertConnectOptions(options);

  const candidate =
    options.host === undefined
      ? discoverGlobalHost()
      : options.host;

  if (candidate === undefined) {
    throw new PdfHubSdkClientError(
      'HOST_UNAVAILABLE',
      'PDFHubSDK is not installed on the current global object. Load the PDF Hub host before connecting, or inject a host explicitly.',
    );
  }

  const host =
    validateHost<THost>(candidate);
  const capabilities =
    readCapabilities(host);

  if (
    capabilities.apiVersion
    !== host.apiVersion
  ) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK host apiVersion does not match getCapabilities().apiVersion.',
      [
        `host.apiVersion=${host.apiVersion}`,
        `capabilities.apiVersion=${capabilities.apiVersion}`,
      ],
    );
  }

  const apiVersion =
    negotiatePdfHubSdkApiVersion(
      host.apiVersion,
      options.acceptedApiVersions
        ?? PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS,
    );

  return Object.freeze({
    clientVersion:
      PDF_HUB_SDK_CLIENT_VERSION,
    apiVersion,
    sdk: host,
    capabilities: Object.freeze({
      ...capabilities,
    }),
  });
}

function discoverGlobalHost():
  | unknown
  | undefined {
  const globalRecord =
    globalThis as {
      PDFHubSDK?: unknown;
    };
  return globalRecord.PDFHubSDK;
}

function validateHost<
  THost extends PdfHubSdkHost,
>(
  value: unknown,
): THost {
  if (!isRecord(value)) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK host must be an object.',
    );
  }

  if (
    typeof value.apiVersion
    !== 'string'
    || value.apiVersion.trim()
      .length === 0
  ) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK host requires a non-empty apiVersion string.',
    );
  }

  const missingMethods =
    REQUIRED_HOST_METHODS.filter(
      (method) =>
        typeof value[method]
        !== 'function',
    );

  if (missingMethods.length > 0) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK host is missing required methods.',
      missingMethods,
    );
  }

  return value as unknown as THost;
}

function readCapabilities(
  host: PdfHubSdkHost,
): PdfHubSdkHostCapabilities {
  let raw: unknown;
  try {
    raw = (
      host.getCapabilities
      as () => unknown
    ).call(host);
  } catch (error) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK getCapabilities() failed.',
      [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    );
  }

  if (
    !isRecord(raw)
    || typeof raw.apiVersion
      !== 'string'
    || raw.apiVersion.trim()
      .length === 0
  ) {
    throw new PdfHubSdkClientError(
      'INVALID_HOST',
      'PDFHubSDK getCapabilities() must return an object with a non-empty apiVersion string.',
    );
  }

  return {
    ...raw,
    apiVersion: raw.apiVersion,
  };
}

function assertConnectOptions(
  value: unknown,
): asserts value is PdfHubSdkConnectOptions {
  if (!isRecord(value)) {
    throw new PdfHubSdkClientError(
      'INVALID_ARGUMENT',
      'connectPdfHubSdk options must be an object.',
    );
  }

  if (
    value.acceptedApiVersions
    !== undefined
  ) {
    assertAcceptedVersions(
      value.acceptedApiVersions,
    );
  }
}

function assertAcceptedVersions(
  value: unknown,
): asserts value is readonly string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some(
      (version) =>
        typeof version
          !== 'string'
        || version.trim()
          .length === 0,
    )
  ) {
    throw new PdfHubSdkClientError(
      'INVALID_ARGUMENT',
      'acceptedApiVersions must be a non-empty array of non-empty strings.',
    );
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value),
  );
}
