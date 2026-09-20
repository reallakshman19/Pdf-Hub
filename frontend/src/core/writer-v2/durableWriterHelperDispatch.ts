import { error as logError } from '@/core/logger/service';
import type {
  WriterCommand,
} from './writerCommands';
import type {
  WriterV2StoreState,
} from './writerV2Store';
import { useWriterV2Store } from './writerV2Store';

export interface DurableWriterHelperDispatchResult {
  changed: boolean;
  reason: string;
}

export async function dispatchDurableWriterHelperLatest(
  context: string,
  factory: (
    state: WriterV2StoreState,
  ) => WriterCommand | null,
): Promise<DurableWriterHelperDispatchResult> {
  try {
    const result =
      await useWriterV2Store
        .getState()
        .dispatchWriterCommandDurableLatest(
          factory,
        );

    return {
      changed: result.changed,
      reason: result.reason,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : String(error);

    logError(
      'writer',
      'Durable Writer helper mutation failed',
      {
        context,
        error: reason,
      },
    );

    return {
      changed: false,
      reason,
    };
  }
}
