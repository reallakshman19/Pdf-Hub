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
  type PdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { validateCommand } from '@/core/commands/validators';
import { error as logError } from '@/core/logger/service';
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
  type PdfHubSdkDonorCommandTarget,
  type PdfHubSdkDonorInput,
  type PdfHubSdkDonorReleaseReason,
  type PdfHubSdkDonorResource,
  type PdfHubSdkErrorCode,
  type PdfHubSdkEvent,
  type PdfHubSdkEventListener,
  type PdfHubSdkEventSubscribeOptions,
  type PdfHubSdkExecuteOptions,
  type PdfHubSdkSessionListener,
  type PdfHubSdkSessionSnapshot,
  type PdfHubSdkSubscribeOptions,
} from './types';

const supportedCommandTypes = new Set<string>(
  PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
);

const donorCommandTargets =
  new Set<PdfHubSdkDonorCommandTarget>([
    'INSERT_PAGES',
    'REPLACE_PAGE',
    'MERGE_PDF',
  ]);

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
  readonly details?: readonly string[];

  constructor(
    code: PdfHubSdkErrorCode,
    message: string,
    details?: readonly string[],
  ) {
    super(message);
    this.name = 'PdfHubSdkError';
    this.code = code;
    this.details = details
      ? [...details]
      : undefined;
  }
}

export function createPdfHubSdk(): PdfHubSdk {
  const donorAdmissions =
    new Map<string, SdkDonorAdmissionRecord>();
  const donorResources =
    new Map<string, SdkDonorResourceRecord>();
  const eventListeners =
    new Set<PdfHubSdkEventListener>();

  const notifyEventListener = (
    listener: PdfHubSdkEventListener,
    event: PdfHubSdkEvent,
  ): void => {
    try {
      listener(event);
    } catch (error) {
      logError(
        'system',
        'PDFHubSDK event listener failed',
        {
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  };

  const notifySessionListener = (
    listener: PdfHubSdkSessionListener,
    snapshot: PdfHubSdkSessionSnapshot,
  ): void => {
    try {
      listener(snapshot);
    } catch (error) {
      logError(
        'system',
        'PDFHubSDK session listener failed',
        {
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  };

  const emitEvent = (
    event: PdfHubSdkEvent,
  ): void => {
    for (const listener of [
      ...eventListeners,
    ]) {
      notifyEventListener(
        listener,
        event,
      );
    }
  };

  const releaseAdmission = (
    admissionId: string,
    reason: PdfHubSdkDonorReleaseReason,
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

    emitEvent({
      type: 'donor-released',
      admissionId,
      commandTarget:
        record.commandTarget,
      documentKey:
        record.documentKey,
      reason,
    });

    return true;
  };

  return Object.freeze({
    apiVersion: PDF_HUB_SDK_API_VERSION,

    getCapabilities(): PdfHubSdkCapabilities {
      return {
        apiVersion: PDF_HUB_SDK_API_VERSION,
        sessionBound: true,
        donorAdmission: true,
        runtimeValidation: true,
        events: true,
        moduleEntry: true,
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
      assertDonorAdmissionRequestInput(
        request,
      );
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
          result.outcome === 'CANCELLED'
            ? 'DONOR_ADMISSION_CANCELLED'
            : 'DONOR_ADMISSION_REJECTED',
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
                'document-changed',
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

      const publicAdmission =
        toPublicDonorAdmission(
          record,
        );

      emitEvent({
        type: 'donor-admitted',
        admission:
          cloneDonorAdmission(
            publicAdmission,
          ),
      });

      return publicAdmission;
    },

    releaseDonorAdmission(
      admissionId: string,
    ): boolean {
      if (
        typeof admissionId !== 'string'
        || admissionId.trim().length === 0
      ) {
        throw new PdfHubSdkError(
          'INVALID_ARGUMENT',
          'releaseDonorAdmission requires a non-empty admission ID.',
        );
      }
      return releaseAdmission(
        admissionId,
        'explicit',
      );
    },

    async executeCommand(
      draft: PdfHubSdkCommandDraft,
      options: PdfHubSdkExecuteOptions = {},
    ): Promise<PdfHubSdkCommandExecution> {
      assertSdkCommandDraftInput(
        draft,
      );
      assertExecuteOptionsInput(
        options,
      );
      const session = requireActiveSession();
      const ownerDocumentKey =
        session.documentKey;

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

      assertCanonicalCommandValid(
        command,
      );

      const donorResolution =
        resolveSdkDonorResources(
          draft,
          ownerDocumentKey,
          options.abortSignal,
          donorAdmissions,
          donorResources,
        );

      const binaries =
        cloneBinaryResources(
          options.binaryResources,
        );

      emitEvent({
        type: 'command-started',
        commandId: command.id,
        commandType: draft.type,
        documentKey: ownerDocumentKey,
      });

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

        const sessionSnapshot =
          snapshotFromSession(
            useSessionStore.getState(),
          );

        emitEvent({
          type: 'command-finished',
          commandId: result.commandId,
          commandType: draft.type,
          documentKey: ownerDocumentKey,
          success: result.success,
          mutated: result.mutated,
          ...(result.error
            ? {
                errorCode:
                  result.error.code,
              }
            : {}),
          session: sessionSnapshot,
        });

        return {
          result,
          session: sessionSnapshot,
        };
      } catch (error) {
        emitEvent({
          type: 'command-finished',
          commandId: command.id,
          commandType: draft.type,
          documentKey: ownerDocumentKey,
          success: false,
          mutated: false,
          exception: true,
          failureMessage:
            error instanceof Error
              ? error.message
              : String(error),
          session: snapshotFromSession(
            useSessionStore.getState(),
          ),
        });
        throw error;
      } finally {
        for (
          const admissionId
          of donorResolution?.admissionIds
            ?? []
        ) {
          releaseAdmission(
            admissionId,
            'command-attempt',
          );
        }
      }
    },

    subscribeSession(
      listener: PdfHubSdkSessionListener,
      options: PdfHubSdkSubscribeOptions = {},
    ): () => void {
      assertSubscriptionInput(
        listener,
        options,
        'subscribeSession',
        'emitCurrent',
      );

      if (options.emitCurrent !== false) {
        notifySessionListener(
          listener,
          snapshotFromSession(
            useSessionStore.getState(),
          ),
        );
      }

      return useSessionStore.subscribe(
        (state) => {
          notifySessionListener(
            listener,
            snapshotFromSession(state),
          );
        },
      );
    },

    subscribeEvents(
      listener: PdfHubSdkEventListener,
      options: PdfHubSdkEventSubscribeOptions = {},
    ): () => void {
      assertSubscriptionInput(
        listener,
        options,
        'subscribeEvents',
        'emitCurrentSession',
      );

      eventListeners.add(listener);

      if (
        options.emitCurrentSession
        !== false
      ) {
        notifyEventListener(
          listener,
          {
            type: 'session-changed',
            session:
              snapshotFromSession(
                useSessionStore
                  .getState(),
              ),
          },
        );
      }

      const unsubscribeSession =
        useSessionStore.subscribe(
          (state) => {
            if (
              eventListeners.has(listener)
            ) {
              notifyEventListener(
                listener,
                {
                  type:
                    'session-changed',
                  session:
                    snapshotFromSession(
                      state,
                    ),
                },
              );
            }
          },
        );

      return () => {
        eventListeners.delete(listener);
        unsubscribeSession();
      };
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

function assertSdkCommandDraftInput(
  value: unknown,
): asserts value is PdfHubSdkCommandDraft {
  if (!isRecord(value)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'executeCommand requires a command object.',
    );
  }

  if (typeof value.type !== 'string') {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'Command type must be a string.',
    );
  }

  if (!supportedCommandTypes.has(value.type)) {
    throw new PdfHubSdkError(
      'UNSUPPORTED_COMMAND',
      `PDFHubSDK does not expose command type ${value.type} in API version ${PDF_HUB_SDK_API_VERSION}.`,
    );
  }

  if (!isRecord(value.payload)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'Command payload must be an object.',
    );
  }
}

function assertCanonicalCommandValid(
  command: PdfCommand,
): void {
  try {
    const validation =
      validateCommand(command);
    if (!validation.ok) {
      throw new PdfHubSdkError(
        'INVALID_ARGUMENT',
        validation.errors.join(' '),
        validation.errors,
      );
    }
  } catch (error) {
    if (error instanceof PdfHubSdkError) {
      throw error;
    }
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      error instanceof Error
        ? `Malformed command payload: ${error.message}`
        : 'Malformed command payload.',
    );
  }
}

function assertSubscriptionInput(
  listener: unknown,
  options: unknown,
  method:
    | 'subscribeSession'
    | 'subscribeEvents',
  optionField:
    | 'emitCurrent'
    | 'emitCurrentSession',
): void {
  if (typeof listener !== 'function') {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      `${method} requires a listener function.`,
    );
  }
  if (!isRecord(options)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      `${method} options must be an object.`,
    );
  }
  const value = options[optionField];
  if (
    value !== undefined
    && typeof value !== 'boolean'
  ) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      `${method} options.${optionField} must be boolean when provided.`,
    );
  }
}

function assertExecuteOptionsInput(
  value: unknown,
): asserts value is PdfHubSdkExecuteOptions {
  if (!isRecord(value)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'executeCommand options must be an object.',
    );
  }

  for (const field of [
    'commandId',
    'groupId',
    'createdAt',
  ] as const) {
    const fieldValue = value[field];
    if (
      fieldValue !== undefined
      && typeof fieldValue !== 'string'
    ) {
      throw new PdfHubSdkError(
        'INVALID_ARGUMENT',
        `executeCommand options.${field} must be a string when provided.`,
      );
    }
  }

  if (
    value.abortSignal !== undefined
    && !isAbortSignalLike(
      value.abortSignal,
    )
  ) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'executeCommand options.abortSignal must be an AbortSignal when provided.',
    );
  }

  if (
    value.binaryResources
    !== undefined
  ) {
    if (
      !isRecord(
        value.binaryResources,
      )
    ) {
      throw new PdfHubSdkError(
        'INVALID_ARGUMENT',
        'executeCommand options.binaryResources must be a record of Uint8Array values.',
      );
    }

    for (
      const [resourceId, bytes]
      of Object.entries(
        value.binaryResources,
      )
    ) {
      if (
        resourceId.trim()
          .length === 0
        || !(bytes
          instanceof Uint8Array)
      ) {
        throw new PdfHubSdkError(
          'INVALID_ARGUMENT',
          'executeCommand binary resources require non-empty IDs and Uint8Array values.',
        );
      }
    }
  }
}

function assertDonorAdmissionRequestInput(
  value: unknown,
): asserts value is PdfHubSdkDonorAdmissionRequest {
  if (!isRecord(value)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'admitDonors requires a request object.',
    );
  }

  if (
    typeof value.commandTarget
      !== 'string'
    || !donorCommandTargets.has(
      value.commandTarget
        as PdfHubSdkDonorCommandTarget,
    )
  ) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'Donor commandTarget must be INSERT_PAGES, REPLACE_PAGE, or MERGE_PDF.',
    );
  }

  if (!Array.isArray(value.donors)) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'Donor admission requires a donors array.',
    );
  }

  if (
    value.abortSignal !== undefined
    && !isAbortSignalLike(
      value.abortSignal,
    )
  ) {
    throw new PdfHubSdkError(
      'INVALID_ARGUMENT',
      'Donor admission abortSignal must be an AbortSignal when provided.',
    );
  }

  value.donors.forEach(
    (donor, index) => {
      if (!isRecord(donor)) {
        throw new PdfHubSdkError(
          'INVALID_ARGUMENT',
          `Donor ${index} must be an object.`,
        );
      }
      if (
        typeof donor.fileName
          !== 'string'
        || donor.fileName.trim()
          .length === 0
      ) {
        throw new PdfHubSdkError(
          'INVALID_ARGUMENT',
          `Donor ${index} requires a non-empty fileName.`,
        );
      }
      if (
        !(donor.bytes
          instanceof Uint8Array)
      ) {
        throw new PdfHubSdkError(
          'INVALID_ARGUMENT',
          `Donor ${index}.bytes must be a Uint8Array.`,
        );
      }
    },
  );
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

function toPublicDonorAdmission(
  record: SdkDonorAdmissionRecord,
): PdfHubSdkDonorAdmission {
  return {
    admissionId: record.admissionId,
    commandTarget:
      record.commandTarget,
    documentKey: record.documentKey,
    donors: record.resources.map(
      (resource, index) => {
        const donor =
          record.admittedSet
            .donors[index];
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
}

function cloneDonorAdmission(
  admission: PdfHubSdkDonorAdmission,
): PdfHubSdkDonorAdmission {
  return {
    ...admission,
    donors: admission.donors.map(
      (donor) => ({ ...donor }),
    ),
  };
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

function isAbortSignalLike(
  value: unknown,
): value is AbortSignal {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.aborted
      === 'boolean'
    && typeof value.addEventListener
      === 'function'
    && typeof value.removeEventListener
      === 'function'
  );
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
