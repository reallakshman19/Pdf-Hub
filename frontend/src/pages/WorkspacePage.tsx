import React from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { TopNav } from '@/components/shell/TopNav';
import { ModeBar } from '@/components/shell/ModeBar';
import { CtxBar } from '@/components/shell/CtxBar';
import { LeftRail } from '@/components/shell/LeftRail';
import { SidebarPanel } from '@/components/sidebar/SidebarPanel';
import { DocumentWorkspace } from '@/components/workspace/DocumentWorkspace';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { StatusBar } from '@/components/shell/StatusBar';
import { MacroBuilderDrawer } from '@/components/macro/MacroBuilderDrawer';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useEditorStore } from '@/core/editor/store';
import { WriterRibbon } from '@/components/writer-v2/WriterRibbon';
import { WriterLayersPanel } from '@/components/writer-v2/WriterLayersPanel';
import { WriterAutosaveController } from '@/components/writer-v2/WriterAutosaveController';
import { WriterRecoveryBanner } from '@/components/writer-v2/WriterRecoveryBanner';
import { WriterQuickTemplatesPanel } from '@/components/writer-v2/WriterQuickTemplatesPanel';
import { WriterObjectSearchPanel } from '@/components/writer-v2/WriterObjectSearchPanel';

export const WorkspacePage: React.FC = () => {
  const capabilities = useCapabilities();
  const activeMode = useEditorStore((state) => state.activeMode);

  return (
    <>
      <AppShell
        topnav={<TopNav />}
        toolbar={
          <>
            <ModeBar />
            <CtxBar />
            {/* Keep ribbon always mounted so its height never causes a layout shift. */}
            <div style={{ display: activeMode === 'write' ? undefined : 'none' }}>
              <WriterRibbon />
            </div>
          </>
        }
        leftRail={<LeftRail />}
        sidebar={<SidebarPanel />}
        workspace={<DocumentWorkspace />}
        inspector={<InspectorPanel />}
        statusbar={<StatusBar />}
      />
      {activeMode === 'write' && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            top: 92,
            zIndex: 181,
          }}
        >
          <WriterObjectSearchPanel />
        </div>
      )}
      {activeMode === 'write' && (
        <div
          style={{
            position: 'fixed',
            right: 280,
            top: 92,
            zIndex: 180,
          }}
        >
          <WriterLayersPanel />
        </div>
      )}
      {activeMode === 'write' && (
        <div
          style={{
            position: 'fixed',
            right: 576,
            top: 92,
            zIndex: 180,
          }}
        >
          <WriterQuickTemplatesPanel />
        </div>
      )}
      {capabilities.hasMacroConsole && <MacroBuilderDrawer />}
      <WriterAutosaveController />
      <WriterRecoveryBanner />
    </>
  );
};
