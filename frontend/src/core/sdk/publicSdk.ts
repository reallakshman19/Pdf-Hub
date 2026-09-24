import type { PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import {
  admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed,
  firstDonorAdmissionErrorMessage,
  isDonorAdmissionBoundaryError,
  revokeAdmittedDonorSet,
  type AdmittedDonorPdf,
  type AdmittedDonorSet,
  type DonorCommandTarget,
} from '@/core/admission/donorPdf';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import {
  PDF_HUB_SDK_API_VERSION,
  PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
  type PdfHubSdk,
  type PdfHubSdkCapabilities,
  type PdfHubSdkCommandDraft,
  type PdfHubSdkCommandExecution,
  type PdfHubSdkDonorAdmission,
  type PdfHubSdkDonorAdmissionRequest,
  type PdfHubSdkDonorInput,
  type PdfHubSdkDonorResource,
  type PdfHubSdkErrorCode,
  type PdfHubSdkExecuteOptions,
  type PdfHubSdkSessionListener,
  type PdfHubSdkSessionSnapshot,
  type PdfHubSdkSubscribeOptions,
} from './types';

const supportedCommandTypes = new Set<string>(
  PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
);

interface SdkDonorResourceRecord {
  resourceId: string;
  admissionId: string;
  commandTarget: DonorCommandTarget;
  documentKey: string;
  donor: AdmittedDonorPdf;
}

interface SdkDonorAdmissionRecord {
  admissionId: string;
  commandTarget: DonorCommandTarget;
  documentKey: string;
  admittedSet: AdmittedDonorSet;
  resources: SdkDonorResourceRecord[];
  unsubscribeSession?: () => void;
}

interface ResolvedSdkDonorResources {
  donors: Record<string, AdmittedDonorPdf>;
  admissionIds: string[];
}

export class PdfHubSdkError extends Error {
  readonly code: PdfHubSdkErrorCode;

  constructor(
    code: PdfHubSdkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfHubSdkError';
    this.code = code;
  }
}

export function createPdfHubSdk(): PdfHubSdk {
  const donorAdmissions =
    new Map<string, SdkDonorAdmissionRecord>();
  const donorResources =
    new Map<string, SdkDonorResourceRecord>();

  const releaseAdmission = (
    admissionId: string,
  ): boolean => {
    const record =
      donorAdmissions.get(admissionId);
    if (!record) return false;

    donorAdmissions.delete(admissionId);
    record.unsubscribeSession?.();
    revokeAdmittedDonorSet(
      record.admittedSet,
    );
    for (const resource of record.resources) {
      donorResources.delete(
        resource.resourceId,
      );
    }
    return true;
  };

  return Object.freeze({
    apiVersion: PDF_HUB_SDK_API_VERSION,

    getCapabilities(): PdfHubSdkCapabilities {
      return {
        apiVersion: PDF_HUB_SDK_API_VERSION,
        sessionBound: true,
        donorAdmission: true,
        legacyHeadlessCompatibility: true,
        commandTypes: [
          ...PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
        ],
      };
    },

    inspectSession(): PdfHubSdkSessionSnapshot {
      return snapshotFromSession(
        useSessionStore.getState(),
      );
    },

    getWorkingPdfBytes(): Uint8Array | null {
      const bytes =
        useSessionStore.getState().workingBytes;
      return bytes ? bytes.slice() : null;
    },

    async admitDonors(
      request: PdfHubSdkDonorAdmissionRequest,
    ): Promise<PdfHubSdkDonorAdmission> {
      const session = requireActiveSession();

      assertDonorInputCardinality(
        request.commandTarget,
        request.donors,
      );

      const sources =
        request.donors.map(
          createPickedDonorSource,
        );
      const ownerDocumentKey =
        session.documentKey;

      const result =
        await admitDonorPdfFiles(
          sources,
          'COMMAND_CALLER',
          request.commandTarget,
          {
            ownerDocumentKey,
            signal: request.abortSignal,
            isContextCurrent: () =>
              useSessionStore.getState()
                .documentKey
              === ownerDocumentKey,
          },
        );

      if (result.outcome !== 'ACCEPTED') {
        throw new PdfHubSdkError(
          'DONOR_ADMISSION_REJECTED',
          firstDonorAdmissionErrorMessage(
            result,
          )
            ?? `Donor admission ended with ${result.outcome}.`,
        );
      }

      const admissionId =
        createSdkResourceId('admission');
      const resources =
        result.value.donors.map(
          (donor): SdkDonorResourceRecord => ({
            resourceId:
              createSdkResourceId('donor'),
            admissionId,
            commandTarget:
              request.commandTarget,
            documentKey:
              ownerDocumentKey,
            donor,
          }),
        );

      const record: SdkDonorAdmissionRecord = {
        admissionId,
        commandTarget:
          request.commandTarget,
        documentKey: ownerDocumentKey,
        admittedSet: result.value,
        resources,
      };

      donorAdmissions.set(
        admissionId,
        record,
      );
      record.unsubscribeSession =
        useSessionStore.subscribe(
          (state) => {
            if (
              state.documentKey
              !== ownerDocumentKey
            ) {
              releaseAdmission(
                admissionId,
              );
            }
          },
        );
      for (const resource of resources) {
        donorResources.set(
          resource.resourceId,
          resource,
        );
      }

      return {
        admissionId,
        commandTarget:
          request.commandTarget,
        documentKey: ownerDocumentKey,
        donors: resources.map(
          (resource, index) => {
            const donor =
              result.value.donors[index];
            return {
              resourceId:
                resource.resourceId,
              fileName: donor.fileName,
              sourceBytes:
                donor.sourceBytes,
              pageCount: donor.pageCount,
            } satisfies PdfHubSdkDonorResource;
          },
        ),
      };
    },

    releaseDonorAdmission(
      admissionId: string,
    ): boolean {
      return releaseAdmission(
        admissionId,
      );
    },

    async executeCommand(
      draft: PdfHubSdkCommandDraft,
      options: PdfHubSdkExecuteOptions = {},
    ): Promise<PdfHubSdkCommandExecution> {
      assertSupportedCommand(draft);

      const session = requireActiveSession();
      const ownerDocumentKey =
        session.documentKey;

      const donorResolution =
        resolveSdkDonorResources(
          draft,
          ownerDocumentKey,
          options.abortSignal,
          donorAdmissions,
          donorResources,
        );

      const command = materializePdfCommand(
        draft,
        'api',
        ownerDocumentKey,
        {
          ...(options.commandId
            ? { id: options.commandId }
            : {}),
          ...(options.groupId
            ? { groupId: options.groupId }
            : {}),
          ...(options.createdAt
            ? { createdAt: options.createdAt }
            : {}),
        },
      );

      const binaries =
        cloneBinaryResources(
          options.binaryResources,
        );

      try {
        const result =
          await commandBus.execute({
            command,
            workingBytes:
              session.workingBytes,
            context: {
              currentPage:
                session.viewState
                  .currentPage,
              selectedPages: [
                ...session.selectedPages,
              ],
              fileName:
                session.fileName
                ?? 'document.pdf',
              documentKey:
                ownerDocumentKey,
            },
            ...(
              binaries
              || donorResolution
                ? {
                    resources: {
                      ...(binaries
                        ? {
                            binaries,
                          }
                        : {}),
                      ...(donorResolution
                        ? {
                            donors:
                              donorResolution
                                .donors,
                          }
                        : {}),
                    },
                  }
                : {}
            ),
            signal: options.abortSignal,
          });

        return {
          result,
          session: snapshotFromSession(
            useSessionStore.getState(),
          ),
        };
      } finally {
        for (
          const admissionId
          of donorResolution?.admissionIds
            ?? []
        ) {
          releaseAdmission(admissionId);
        }
      }
    },

    subscribeSession(
      listener: PdfHubSdkSessionListener,
      options: PdfHubSdkSubscribeOptions = {},
    ): () => void {
      if (options.emitCurrent !== false) {
        listener(
          snapshotFromSession(
            useSessionStore.getState(),
          ),
        );
      }

      return useSessionStore.subscribe(
        (state) => {
          listener(snapshotFromSession(state));
        },
      );
    },
  });
}

function requireActiveSession(): {
  documentKey: string;
  workingBytes: Uint8Array;
  fileName: string | null;
  selectedPages: number[];
  viewState: {
    currentPage: number;
  };
} {
  const session =
    useSessionStore.getState();
  if (
    !session.documentKey
    || !session.workingBytes
  ) {
    throw new PdfHubSdkError(
      'NO_ACTIVE_DOCUMENT',
      'PDFHubSDK requires an active PDF document for this operation.',
    );
  }
  return {
    documentKey: session.documentKey,
    workingBytes: session.workingBytes,
    fileName: session.fileName,
    selectedPages:
      session.selectedPages,
    viewState: {
      currentPage:
        session.viewState.currentPage,
    },
  };
}

function assertSupportedCommand(
  draft: PdfCommandDraft,
): asserts draft is PdfHubSdkCommandDraft {
  if (!supportedCommandTypes.has(draft.type)) {
    throw new PdfHubSdkError(
      'UNSUPPORTED_COMMAND',
      `PDFHubSDK does not expose command type ${draft.type} in API version ${PDF_HUB_SDK_API_VERSION}.`,
    );
  }
}

function assertDonorInputCardinality(
  target: DonorCommandTarget,
  donors: readonly PdfHubSdkDonorInput[],
): void {
  if (donors.length === 0) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'Donor admission requires at least one PDF.',
    );
  }
  if (
    target !== 'MERGE_PDF'
    && donors.length !== 1
  ) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      `${target} requires exactly one admitted donor PDF.`,
    );
  }
}

function createPickedDonorSource(
  input: PdfHubSdkDonorInput,
): PickedPdfFileSource {
  const bytes = Uint8Array.from(
    input.bytes,
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset
      + bytes.byteLength,
  ) as ArrayBuffer;
  return {
    file: new File(
      [buffer],
      input.fileName,
      { type: 'application/pdf' },
    ),
  };
}

function resolveSdkDonorResources(
  draft: PdfHubSdkCommandDraft,
  ownerDocumentKey: string,
  signal: AbortSignal | undefined,
  admissions:
    ReadonlyMap<
      string,
      SdkDonorAdmissionRecord
    >,
  resources:
    ReadonlyMap<
      string,
      SdkDonorResourceRecord
    >,
): ResolvedSdkDonorResources | null {
  const target =
    donorTargetForDraft(draft);
  if (!target) return null;

  const resourceIds =
    donorResourceIdsForDraft(draft);
  const records =
    resourceIds.map(
      (resourceId) =>
        resources.get(resourceId),
    );

  if (
    records.some(
      (record) => !record,
    )
  ) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'One or more donor resource IDs are unknown, released, consumed, or stale.',
    );
  }

  const resolved =
    records as SdkDonorResourceRecord[];
  const admissionIds =
    Array.from(
      new Set(
        resolved.map(
          (record) =>
            record.admissionId,
        ),
      ),
    );

  if (admissionIds.length !== 1) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'A donor command must use exactly one SDK donor admission.',
    );
  }

  const admission =
    admissions.get(
      admissionIds[0],
    );
  if (!admission) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'The SDK donor admission is no longer active.',
    );
  }

  if (
    admission.commandTarget !== target
    || admission.documentKey
      !== ownerDocumentKey
  ) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'The donor admission does not match the active document or command target.',
    );
  }

  const admittedResourceIds =
    admission.resources.map(
      (resource) =>
        resource.resourceId,
    );
  if (
    admittedResourceIds.length
      !== resourceIds.length
    || admittedResourceIds.some(
      (resourceId, index) =>
        resourceId
        !== resourceIds[index],
    )
  ) {
    throw new PdfHubSdkError(
      'DONOR_ADMISSION_INVALID',
      'The donor command must use the complete admitted resource set in admission order.',
    );
  }

  try {
    assertAdmittedDonorSetDispatchAllowed(
      admission.admittedSet,
      {
        ownerDocumentKey,
        signal,
        isContextCurrent: () =>
          useSessionStore.getState()
            .documentKey
          === ownerDocumentKey,
      },
    );
  } catch (error) {
    if (
      isDonorAdmissionBoundaryError(
        error,
      )
    ) {
      throw new PdfHubSdkError(
        'DONOR_ADMISSION_INVALID',
        error.message,
      );
    }
    throw error;
  }

  return {
    admissionIds,
    donors: Object.fromEntries(
      resolved.map(
        (record) => [
          record.resourceId,
          record.donor,
        ],
      ),
    ),
  };
}

function donorTargetForDraft(
  draft: PdfHubSdkCommandDraft,
): DonorCommandTarget | null {
  switch (draft.type) {
    case 'INSERT_PAGES':
    case 'REPLACE_PAGE':
    case 'MERGE_PDF':
      return draft.type;
    default:
      return null;
  }
}

function donorResourceIdsForDraft(
  draft: PdfHubSdkCommandDraft,
): string[] {
  switch (draft.type) {
    case 'INSERT_PAGES':
    case 'REPLACE_PAGE':
      return [
        draft.payload
          .donorResourceId,
      ];
    case 'MERGE_PDF':
      return [
        ...draft.payload
          .donorResourceIds,
      ];
    default:
      return [];
  }
}

function snapshotFromSession(
  session: ReturnType<
    typeof useSessionStore.getState
  >,
): PdfHubSdkSessionSnapshot {
  return {
    documentKey: session.documentKey,
    fileName: session.fileName,
    pageCount: session.pageCount,
    pageGraph: clonePageGraph(
      session.pageGraph,
    ),
    currentPageId:
      session.viewState.currentPageId,
    currentPage:
      session.viewState.currentPage,
    selectedPageIds: [
      ...session.selectedPageIds,
    ],
    selectedPages: [
      ...session.selectedPages,
    ],
    isDirty: session.isDirty,
    isDocumentDirty:
      session.isDocumentDirty,
    isReviewDirty: session.isReviewDirty,
    isSessionDirty:
      session.isSessionDirty,
  };
}

function clonePageGraph(
  pageGraph: PageGraph<PageNode> | null,
): PageGraph<PageNode> | null {
  if (!pageGraph) return null;

  return {
    pages: pageGraph.pages.map(
      (page) => ({ ...page }),
    ),
    ...(pageGraph.pageLabelRanges
      ? {
          pageLabelRanges:
            pageGraph.pageLabelRanges.map(
              (range) => ({ ...range }),
            ),
        }
      : {}),
  };
}

function cloneBinaryResources(
  resources:
    | Readonly<Record<string, Uint8Array>>
    | undefined,
): Record<string, Uint8Array> | undefined {
  if (!resources) return undefined;

  return Object.fromEntries(
    Object.entries(resources).map(
      ([resourceId, bytes]) => [
        resourceId,
        bytes.slice(),
      ],
    ),
  );
}

function createSdkResourceId(
  kind: 'admission' | 'donor',
): string {
  const uuid =
    globalThis.crypto
      ?.randomUUID?.();
  if (uuid) {
    return `pdf-hub-sdk-${kind}-${uuid}`;
  }
  return `pdf-hub-sdk-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
