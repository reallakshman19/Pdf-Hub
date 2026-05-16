import React from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { TopNav } from '@/components/shell/TopNav';
import { ToolbarBand } from '@/components/shell/ToolbarBand';
import { LeftRail } from '@/components/shell/LeftRail';
import { SidebarPanel } from '@/components/sidebar/SidebarPanel';
import { DocumentWorkspace } from '@/components/workspace/DocumentWorkspace';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { StatusBar } from '@/components/shell/StatusBar';

export const WorkspacePage: React.FC = () => {

  return (
    <AppShell
      topnav={<TopNav />}
      toolbar={<ToolbarBand />}
      leftRail={<LeftRail />}
      sidebar={<SidebarPanel />}
      workspace={<DocumentWorkspace />}
      inspector={<InspectorPanel />}
      statusbar={<StatusBar />}
    />
  );
};