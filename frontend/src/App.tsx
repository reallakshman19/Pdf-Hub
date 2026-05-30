import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { MacroBuilderPage } from '@/pages/MacroBuilderPage';

import { DebugPage } from '@/pages/DebugPage';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { ToastProvider } from '@/components/ui/Toast';
import { isDebugRouteEnabled } from '@/core/debug/availability';
import { useCapabilities } from '@/hooks/useCapabilities';

const AppContent = () => {
  useKeyboardShortcuts();
  useUnsavedChangesGuard();
  const debugEnabled = isDebugRouteEnabled(window.location.hostname);
  const capabilities = useCapabilities();

  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/workspace" element={<Navigate to="/" replace />} />
      <Route path="/macro-builder" element={capabilities.hasMacroConsole ? <MacroBuilderPage /> : <Navigate to="/" replace />} />
      <Route path="/debug" element={debugEnabled ? <DebugPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <HashRouter>
      <AppContent />
      <ToastProvider />
    </HashRouter>
  );
}

export default App;
