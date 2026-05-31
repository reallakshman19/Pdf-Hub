import { useEffect } from 'react';
import { useSessionStore } from '@/core/session/store';

export const useUnsavedChangesGuard = () => {
  const isDirty = useSessionStore((state) => state.isDirty);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useSessionStore.getState().isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
};