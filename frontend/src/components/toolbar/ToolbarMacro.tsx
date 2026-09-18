import React from 'react';
import { Workflow } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import { useShallow } from 'zustand/react/shallow';

export const ToolbarMacro: React.FC = () => {
  const {
    setSidebarTab,
    setLeftPanelWidth,
    leftPanelWidth,
  } = useEditorStore(useShallow((state) => ({
    setSidebarTab: state.setSidebarTab,
    setLeftPanelWidth: state.setLeftPanelWidth,
    leftPanelWidth: state.leftPanelWidth,
  })));
  const isMobile = useIsMobile();

  const openAutomate = () => {
    setSidebarTab('macros');
    if (leftPanelWidth < 1) {
      setLeftPanelWidth(20);
    }
  };

  return (
    <Tooltip content="Open Automate">
      <Button
        variant="secondary"
        size={isMobile ? 'icon' : 'sm'}
        onClick={openAutomate}
        className={isMobile ? 'h-8 w-8 min-w-[32px]' : 'h-8'}
        title="Open Automate"
        data-testid="open-automate"
      >
        <Workflow className={isMobile ? 'h-[18px] w-[18px]' : 'mr-1 h-4 w-4'} />
        {!isMobile && 'Automate'}
      </Button>
    </Tooltip>
  );
};
