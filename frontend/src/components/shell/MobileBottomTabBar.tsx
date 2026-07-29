import React from 'react';
import { Layers, Highlighter, PenTool, MousePointer2, MoreHorizontal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';

export const MobileBottomTabBar: React.FC = () => {
  const {
    activeMode,
    setActiveMode,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    mobileSheetOpen,
    setMobileSheetOpen,
  } = useEditorStore(useShallow((state) => ({
    activeMode: state.activeMode,
    setActiveMode: state.setActiveMode,
    mobileDrawerOpen: state.mobileDrawerOpen,
    setMobileDrawerOpen: state.setMobileDrawerOpen,
    mobileSheetOpen: state.mobileSheetOpen,
    setMobileSheetOpen: state.setMobileSheetOpen,
  })));

  const handleTabClick = (tab: 'pages' | 'annotate' | 'draw' | 'view' | 'more') => {
    if (tab === 'pages') {
      setMobileDrawerOpen(!mobileDrawerOpen);
      if (mobileSheetOpen) setMobileSheetOpen(false);
    } else if (tab === 'more') {
      setMobileSheetOpen(!mobileSheetOpen);
      if (mobileDrawerOpen) setMobileDrawerOpen(false);
    } else {
      // Set active modes
      if (tab === 'annotate') setActiveMode('annotate');
      if (tab === 'draw') setActiveMode('draw');
      if (tab === 'view') setActiveMode('view');
      
      // Close side panels if open
      if (mobileDrawerOpen) setMobileDrawerOpen(false);
      if (mobileSheetOpen) setMobileSheetOpen(false);
    }
  };

  const getButtonClass = (isActive: boolean) => {
    return [
      'flex-1 flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] gap-1 transition-colors select-none border-none bg-transparent cursor-pointer',
      isActive
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
    ].join(' ');
  };

  return (
    <div
      role="tablist"
      data-testid="mobile-bottom-bar"
      className="shrink-0 h-[56px] border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-around safe-bottom"
    >
      <button
        role="tab"
        aria-selected={mobileDrawerOpen}
        onClick={() => handleTabClick('pages')}
        className={getButtonClass(mobileDrawerOpen)}
      >
        <Layers className="w-5 h-5" />
        <span className="text-[10px] font-medium">Pages</span>
      </button>

      <button
        role="tab"
        aria-selected={activeMode === 'annotate' && !mobileDrawerOpen && !mobileSheetOpen}
        onClick={() => handleTabClick('annotate')}
        className={getButtonClass(activeMode === 'annotate' && !mobileDrawerOpen && !mobileSheetOpen)}
      >
        <Highlighter className="w-5 h-5" />
        <span className="text-[10px] font-medium">Annotate</span>
      </button>

      <button
        role="tab"
        aria-selected={activeMode === 'draw' && !mobileDrawerOpen && !mobileSheetOpen}
        onClick={() => handleTabClick('draw')}
        className={getButtonClass(activeMode === 'draw' && !mobileDrawerOpen && !mobileSheetOpen)}
      >
        <PenTool className="w-5 h-5" />
        <span className="text-[10px] font-medium">Draw</span>
      </button>

      <button
        role="tab"
        aria-selected={activeMode === 'view' && !mobileDrawerOpen && !mobileSheetOpen}
        onClick={() => handleTabClick('view')}
        className={getButtonClass(activeMode === 'view' && !mobileDrawerOpen && !mobileSheetOpen)}
      >
        <MousePointer2 className="w-5 h-5" />
        <span className="text-[10px] font-medium">View</span>
      </button>

      <button
        role="tab"
        aria-selected={mobileSheetOpen}
        onClick={() => handleTabClick('more')}
        className={getButtonClass(mobileSheetOpen)}
      >
        <MoreHorizontal className="w-5 h-5" />
        <span className="text-[10px] font-medium">More</span>
      </button>
    </div>
  );
};
