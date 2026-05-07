import { useEffect } from 'react';
import { log } from '@/core/logger/service';

export type AppMode = 'static';

export interface Capabilities {
  mode: AppMode;
  serverAlive: false;
  hasServerOcr: false;
  hasMacroConsole: true;
  latencyMs: null;
}

const STATIC_CAPABILITIES: Capabilities = {
  mode: 'static',
  serverAlive: false,
  hasServerOcr: false,
  hasMacroConsole: true,
  latencyMs: null,
};

let modeLogged = false;

/**
 * Returns static runtime capabilities for the frontend-only app shell.
 */
export function useCapabilities(): Capabilities {
  useEffect(() => {
    if (modeLogged) {
      return;
    }
    modeLogged = true;
    log('capabilities', 'Mode detection complete', {
      mode: STATIC_CAPABILITIES.mode,
      serverAlive: STATIC_CAPABILITIES.serverAlive,
      latencyMs: STATIC_CAPABILITIES.latencyMs,
    });
  }, []);

  return STATIC_CAPABILITIES;
}
