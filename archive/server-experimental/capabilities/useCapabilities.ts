import { useState, useEffect } from 'react';
import type { AppCapabilities } from './types';
import { resolveCapabilities } from './resolver';

export const useCapabilities = () => {
  const [capabilities, setCapabilities] = useState<AppCapabilities | null>(null);

  useEffect(() => {
    let mounted = true;
    resolveCapabilities().then((caps) => {
      if (mounted) {
        setCapabilities(caps);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return capabilities;
};
