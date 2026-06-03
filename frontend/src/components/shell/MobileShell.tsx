import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useCapabilities } from '@/hooks/useCapabilities';
import { PreviewModeBanner } from '@/components/shell/PreviewModeBanner';
import { MobileBottomTabBar } from '@/components/shell/MobileBottomTabBar';
import { MobileDrawer } from '@/components/shell/MobileDrawer';
import { MobileSheet } from '@/components/shell/MobileSheet';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { ModeBar } from '@/components/shell/ModeBar';
import { CtxBar } from '@/components/shell/CtxBar';
import { FolderOpen, Save } from 'lucide-react';

interface MobileShellProps {
  topnav: ReactNode;
  toolbar: ReactNode;   // hidden on mobile
  leftRail: ReactNode;  // hidden on mobile
  sidebar: ReactNode;   // rendered in MobileDrawer
  workspace: ReactNode;
  inspector: ReactNode; // rendered in MobileSheet
  statusbar: ReactNode; // hidden on mobile
}

export const MobileShell: React.FC<MobileShellProps> = ({
  topnav,
  sidebar,
  workspace,
  inspector,
}) => {
  const capabilities = useCapabilities();
  const documentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);
  const boundaryResetKey = documentKey ?? fileName ?? '';

  const {
    mobileDrawerOpen,
    setMobileDrawerOpen,
    mobileSheetOpen,
    setMobileSheetOpen,
  } = useEditorStore();

  const selectedAnnotationIds = useAnnotationStore((state) => state.selectedAnnotationIds);
  const prevSelectedCountRef = useRef(0);

  // Automatically open bottom sheet when an annotation is selected
  useEffect(() => {
    const count = selectedAnnotationIds.length;
    if (count > 0 && prevSelectedCountRef.current === 0) {
      setMobileSheetOpen(true);
      // Automatically close drawer if it is open
      setMobileDrawerOpen(false);
    } else if (count === 0 && prevSelectedCountRef.current > 0) {
      setMobileSheetOpen(false);
    }
    prevSelectedCountRef.current = count;
  }, [selectedAnnotationIds, setMobileSheetOpen, setMobileDrawerOpen]);

  const hasSelection = selectedAnnotationIds.length > 0;

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Navigation */}
      <div data-testid="top-nav" className="shrink-0 safe-top">
        {topnav}
      </div>

      {/* Preview Mode Banner */}
      <PreviewModeBanner mode={capabilities.mode} />

      {/* Main Workspace (Full width) */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ErrorBoundary zone="Document Workspace" resetKey={boundaryResetKey}>
          {workspace}
        </ErrorBoundary>
      </div>

      {/* Context Toolbar */}
      {fileName && (
        <div className="border-t border-slate-200 dark:border-slate-800 shrink-0">
          <CtxBar />
        </div>
      )}

      {/* Bottom Navigation */}
      <MobileBottomTabBar />

      {/* Drawer (sidebar content) */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      >
        <ErrorBoundary zone="Sidebar" resetKey={boundaryResetKey}>
          {sidebar}
        </ErrorBoundary>
      </MobileDrawer>

      {/* Bottom Sheet (inspector or more content) */}
      <MobileSheet
        isOpen={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title={hasSelection ? 'Inspector' : 'More Actions'}
      >
        {hasSelection ? (
          <ErrorBoundary zone="Inspector" resetKey={boundaryResetKey}>
            {inspector}
          </ErrorBoundary>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Select Mode
              </div>
              <ModeBar />
            </div>

            {/* Quick Actions */}
            <div className="border-t border-slate-150 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Quick Actions
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMobileSheetOpen(false);
                    document.dispatchEvent(new CustomEvent('pdf-hub:open'));
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
                  Open PDF
                </button>
                <button
                  onClick={() => {
                    setMobileSheetOpen(false);
                    document.dispatchEvent(new CustomEvent('pdf-hub:save'));
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <Save className="w-4 h-4 text-slate-500 shrink-0" />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </MobileSheet>
    </div>
  );
};
