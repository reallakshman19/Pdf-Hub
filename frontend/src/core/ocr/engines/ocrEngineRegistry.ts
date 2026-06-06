import type {
  OcrEngine,
  OcrEngineRegistry,
} from './ocrEngineContract';
import { mockOcrEngine } from './mockOcrEngine';
import { tesseractJsEngine } from './tesseractJsEngine';

export function createOcrEngineRegistry(
  engines: OcrEngine[] = [
    mockOcrEngine,
    tesseractJsEngine,
  ],
): OcrEngineRegistry {
  const byId = new Map(engines.map((engine) => [engine.id, engine]));

  return {
    getEngine(engineId: string): OcrEngine | null {
      return byId.get(engineId) ?? null;
    },

    listEngines(): OcrEngine[] {
      return [...byId.values()];
    },
  };
}

export const defaultOcrEngineRegistry = createOcrEngineRegistry();
