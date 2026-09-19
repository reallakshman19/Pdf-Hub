import {
  createBestAvailableWriterPersistence,
  type WriterPersistenceAdapterV2,
} from './indexedDbWriterStore';

let runtimeAdapter:
  | WriterPersistenceAdapterV2
  | null = null;

export function resolveWriterPersistenceAdapter(): WriterPersistenceAdapterV2 {
  if (!runtimeAdapter) {
    runtimeAdapter =
      createBestAvailableWriterPersistence();
  }

  return runtimeAdapter;
}

export function setWriterPersistenceAdapterForTests(
  adapter: WriterPersistenceAdapterV2,
): void {
  runtimeAdapter = adapter;
}

export function resetWriterPersistenceAdapterForTests(): void {
  runtimeAdapter = null;
}
