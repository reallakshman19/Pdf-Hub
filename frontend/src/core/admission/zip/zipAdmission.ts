import {
  ZipStructuralAdmissionError,
  type ZipArchiveInventory,
} from './zipTypes';

export function admitZipArchive(inventory: ZipArchiveInventory): ZipArchiveInventory {
  if (inventory.outcome === 'ADMITTED') return inventory;

  const diagnostic = inventory.diagnostics[0];
  throw new ZipStructuralAdmissionError(
    inventory,
    diagnostic?.message ?? 'Writer project archive failed structural admission.',
  );
}
