import React from 'react';
import type { ReactNode } from 'react';
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PreviewModeBanner } from '@/components/shell/PreviewModeBanner';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileShell } from '@/components/shell/MobileShell';

interface AppShellProps {
  topnav: ReactNode;
  toolbar: ReactNode;
  leftRail: ReactNode;
  sidebar: ReactNode;
  workspace: ReactNode;
  inspector: ReactNode;
  statusbar: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = (props) => {
  const { topnav, toolbar, leftRail, sidebar, workspace, inspector, statusbar } = props;
  const isMobile = useIsMobile();
  const { leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth } = useEditorStore();
  const capabilities = useCapabilities();
  const documentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);
  const boundaryResetKey = documentKey ?? fileName ?? '';
  const leftPanelRef = React.useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = React.useRef<PanelImperativeHandle | null>(null);

  const handleLayoutChanged = React.useCallback(
    (layout: Record<string, number>) => {
      const nextLeft = layout.sidebar;
      const nextRight = layout.inspector;

      if (typeof nextLeft === 'number' && Math.abs(nextLeft - leftPanelWidth) > 0.2) {
        setLeftPanelWidth(nextLeft);
      }
      if (typeof nextRight === 'number' && Math.abs(nextRight - rightPanelWidth) > 0.2) {
        setRightPanelWidth(nextRight);
      }
    },
    [leftPanelWidth, rightPanelWidth, setLeftPanelWidth, setRightPanelWidth],
  );

  React.useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;

    const current = panel.getSize().asPercentage;
    if (Math.abs(current - leftPanelWidth) < 0.2) return;

    if (leftPanelWidth <= 0.1) {
      panel.collapse();
      return;
    }

    if (panel.isCollapsed()) {
      panel.expand();
    }
    panel.resize(`${leftPanelWidth}%`);
  }, [leftPanelWidth]);

  React.useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;

    const current = panel.getSize().asPercentage;
    if (Math.abs(current - rightPanelWidth) < 0.2) return;

    if (rightPanelWidth <= 0.1) {
      panel.collapse();
      return;
    }

    if (panel.isCollapsed()) {
      panel.expand();
    }
    panel.resize(`${rightPanelWidth}%`);
  }, [rightPanelWidth]);

  if (isMobile) {
    return <MobileShell {...props} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-hidden">
      <div data-testid="top-nav" className="shrink-0">{topnav}</div>
      <div data-testid="toolbar-band" className="shrink-0">{toolbar}</div>

      <div className="flex-1 flex overflow-hidden">
        <div data-testid="left-rail" className="shrink-0">{leftRail}</div>

        <PanelGroup
          orientation="horizontal"
          resizeTargetMinimumSize={{ coarse: 28, fine: 12 }}
          onLayoutChanged={handleLayoutChanged}
          className="flex-1"
        >
          <Panel
            panelRef={leftPanelRef}
            defaultSize={`${leftPanelWidth}%`}
            minSize="0%"
            maxSize="40%"
            collapsible
            collapsedSize="0%"
            id="sidebar"
            className="flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800"
          >
            <div data-testid="sidebar-panel" className="h-full w-full">
              <ErrorBoundary zone="Sidebar" resetKey={boundaryResetKey}>
                {sidebar}
              </ErrorBoundary>
            </div>
          </Panel>

          <PanelResizeHandle className="w-2 shrink-0 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors cursor-col-resize" />

          <Panel id="workspace" className="flex flex-col bg-slate-100 dark:bg-slate-950/50">
            <div data-testid="document-workspace" className="h-full w-full flex flex-col">
              <PreviewModeBanner mode={capabilities.mode} />
              <div className="min-h-0 flex-1">
                <ErrorBoundary zone="Document Workspace" resetKey={boundaryResetKey}>
                  {workspace}
                </ErrorBoundary>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-2 shrink-0 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors cursor-col-resize" />

          <Panel
            panelRef={rightPanelRef}
            defaultSize={`${rightPanelWidth}%`}
            minSize="0%"
            maxSize="40%"
            collapsible
            collapsedSize="0%"
            id="inspector"
            className="flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
          >
            <div data-testid="inspector-panel" className="h-full w-full">
              <ErrorBoundary zone="Inspector" resetKey={boundaryResetKey}>
                {inspector}
              </ErrorBoundary>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div data-testid="status-bar" className="shrink-0">{statusbar}</div>
    </div>
  );
};
