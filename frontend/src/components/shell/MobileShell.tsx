import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useCapabilities } from '@/hooks/useCapabilities';
import { PreviewModeBanner } from '@/components/shell/PreviewModeBanner';
import { MobileBottomTabBar } from '@/components/shell/MobileBottomTabBar';
import { MobileDrawer } from '@/components/shell/MobileDrawer';
import { MobileSheet } from '@/components/shell/MobileSheet';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { ModeBar } from '@/components/shell/ModeBar';
import { CtxBar } from '@/components/shell/CtxBar';
import {
  ArrowLeft,
  FolderOpen,
  Printer,
  Ruler,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

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
    inspectorTab,
    setInspectorTab,
    existingTextSelection,
  } = useEditorStore(useShallow((state) => ({
    mobileDrawerOpen: state.mobileDrawerOpen,
    setMobileDrawerOpen: state.setMobileDrawerOpen,
    mobileSheetOpen: state.mobileSheetOpen,
    setMobileSheetOpen: state.setMobileSheetOpen,
    inspectorTab: state.inspectorTab,
    setInspectorTab: state.setInspectorTab,
    existingTextSelection:
      state.existingTextSelection,
  })));

  const selectedAnnotationIds = useAnnotationStore((state) => state.selectedAnnotationIds);
  const prevSelectedCountRef = useRef(0);

  const hasSelection = selectedAnnotationIds.length > 0;
  const hasExistingTextSelection =
    inspectorTab === 'text'
    && existingTextSelection !== null;

  // Automatically open the bottom sheet for a newly selected annotation.
  // When annotation selection is cleared, preserve the sheet if a direct
  // existing-PDF text target is still active.
  useEffect(() => {
    const count = selectedAnnotationIds.length;
    if (count > 0 && prevSelectedCountRef.current === 0) {
      setMobileSheetOpen(true);
      setMobileDrawerOpen(false);
    } else if (
      count === 0
      && prevSelectedCountRef.current > 0
      && !hasExistingTextSelection
    ) {
      setMobileSheetOpen(false);
    }
    prevSelectedCountRef.current = count;
  }, [
    hasExistingTextSelection,
    selectedAnnotationIds,
    setMobileSheetOpen,
    setMobileDrawerOpen,
  ]);

  const writerV2SelectionCount = useWriterV2Store((state) => state.selectedIds.length);
  const writerV2ActiveId = useWriterV2Store((state) => state.activeId);
  const isBlankDocument = useWriterV2Store((state) => state.documentMeta?.mode === 'blankDocument');

  const hasSelectionDrivenInspector =
    hasSelection
    || hasExistingTextSelection
    || writerV2SelectionCount > 0
    || writerV2ActiveId !== null;

  const hasStandaloneInspectorTab =
    inspectorTab === 'compliance'
    || inspectorTab === 'redaction'
    || inspectorTab === 'takeoff';

  const hasInspectorContent =
    hasSelectionDrivenInspector
    || hasStandaloneInspectorTab;

  const handleCloseSheet = () => {
    setMobileSheetOpen(false);
    if (hasStandaloneInspectorTab && !hasSelectionDrivenInspector) {
      setInspectorTab('properties');
    }
  };

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
      {(fileName || isBlankDocument) && (
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
        onClose={handleCloseSheet}
        title={hasInspectorContent ? 'Inspector' : 'More Actions'}
      >
        {hasInspectorContent ? (
          <div className="flex flex-col gap-2">
            {hasStandaloneInspectorTab && !hasSelectionDrivenInspector ? (
              <button
                type="button"
                data-testid="mobile-back-to-more-actions"
                onClick={() => setInspectorTab('properties')}
                className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 border-none cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to More Actions
              </button>
            ) : null}
            <ErrorBoundary zone="Inspector" resetKey={boundaryResetKey}>
              {inspector}
            </ErrorBoundary>
          </div>
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
                <button
                  onClick={() => {
                    setMobileSheetOpen(false);
                    document.dispatchEvent(new CustomEvent('pdf-hub:print'));
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-500 shrink-0" />
                  Print PDF
                </button>
              </div>
            </div>

            {/* Standalone Inspector Panels */}
            <div className="border-t border-slate-150 dark:border-slate-800 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Document Tools
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="mobile-open-compliance-tab"
                  onClick={() => setInspectorTab('compliance')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
                  PDF/A &amp; Compliance
                </button>
                <button
                  type="button"
                  data-testid="mobile-open-redaction-tab"
                  onClick={() => setInspectorTab('redaction')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
                  Redaction
                </button>
                <button
                  type="button"
                  data-testid="mobile-open-takeoff-tab"
                  onClick={() => setInspectorTab('takeoff')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 select-none border-none text-left cursor-pointer"
                >
                  <Ruler className="w-4 h-4 text-slate-500 shrink-0" />
                  CAD Takeoff
                </button>
              </div>
            </div>
          </div>
        )}
      </MobileSheet>
    </div>
  );
};
