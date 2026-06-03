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
      {capabilities.hasMacroConsole && <MacroBuilderDrawer />}
    </>
  );
};

