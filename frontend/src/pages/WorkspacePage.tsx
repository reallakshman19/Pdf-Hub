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
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterRibbon } from '@/components/writer-v2/WriterRibbon';
import { WriterAutosaveController } from '@/components/writer-v2/WriterAutosaveController';
import { WriterRecoveryBanner } from '@/components/writer-v2/WriterRecoveryBanner';
import { WriterToolsHub } from '@/components/writer-v2/WriterToolsHub';
import { WriterBlankDocumentCanvas } from '@/components/writer-v2/WriterBlankDocumentCanvas';

export const WorkspacePage: React.FC = () => {
  const capabilities = useCapabilities();
  const activeMode = useEditorStore((state) => state.activeMode);
  const viewState = useSessionStore((state) => state.viewState);
  const documentMeta = useWriterV2Store((state) => state.documentMeta);
  const isBlankDocument = documentMeta?.mode === 'blankDocument';

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
        workspace={
          isBlankDocument ? (
            <WriterBlankDocumentCanvas
              documentMeta={documentMeta}
              scale={viewState.zoom / 100}
            />
          ) : (
            <DocumentWorkspace />
          )
        }
        inspector={<InspectorPanel />}
        statusbar={<StatusBar />}
      />
      {activeMode === 'write' && <WriterToolsHub />}
      {capabilities.hasMacroConsole && <MacroBuilderDrawer />}
      <WriterAutosaveController />
      <WriterRecoveryBanner />
    </>
  );
};
