import React, { useState, Suspense } from 'react';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { MacrosSidebar } from '@/components/sidebar/MacrosSidebar';
import OcrJobsPanel from '@/components/sidebar/OcrJobsPanel';
import { ocrStore } from '@/core/ocr/store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCapabilities } from '@/hooks/useCapabilities';
import { FeatureUnavailable } from '@/components/ui/FeatureUnavailable';

const OcrPanelConnected: React.FC = () => {
  const documentKey = useSessionStore((s) => s.documentKey) ?? '';
  const selectedPages = useSessionStore((s) => s.selectedPages);
  return <OcrJobsPanel ocrStore={ocrStore} documentKey={documentKey} selectedPages={selectedPages} />;
};

const ThumbnailSidebar = React.lazy(() => import('./panels/ThumbnailSidebar'));
const BookmarksSidebar = React.lazy(() => import('./panels/BookmarksSidebar'));
const CommentsSidebar = React.lazy(() =>
  import('@/components/sidebar/CommentsSidebar').then((module) => ({
    default: module.CommentsSidebar,
  })),
);
const SearchPanel = React.lazy(() =>
  import('@/components/sidebar/SearchPanel').then((module) => ({
    default: module.SearchPanel,
  })),
);

export const SidebarPanel: React.FC = () => {
  const { sidebarTab, leftPanelWidth, setLeftPanelWidth } = useEditorStore();
  const capabilities = useCapabilities();
  const [previousWidth, setPreviousWidth] = useState(20);

  const isCollapsed = leftPanelWidth <= 0.1;

  const toggleCollapse = () => {
    if (isCollapsed) {
      setLeftPanelWidth(previousWidth < 10 ? 20 : previousWidth);
    } else {
      setPreviousWidth(leftPanelWidth);
      setLeftPanelWidth(0);
    }
  };

  const getPanelTitle = () => {
    switch (sidebarTab) {
      case 'thumbnails': return 'Pages';
      case 'bookmarks':  return 'Bookmarks';
      case 'comments':   return 'Comments';
      case 'search':     return 'Search';
      case 'macros':     return 'Macros';
      case 'ocr':        return 'OCR';
      default:           return 'Panel';
    }
  };

  if (isCollapsed) {
    return (
      <div className="absolute top-4 left-4 z-10" style={{ transform: 'translateX(3rem)' }}>
        <Button
          data-testid="sidebar-collapse-btn"
          variant="secondary"
          size="icon"
          onClick={toggleCollapse}
          className="shadow-md rounded-full h-8 w-8"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {getPanelTitle()}
        </h2>
        <Button
          data-testid="sidebar-collapse-btn"
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mr-2"
          onClick={toggleCollapse}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto relative flex flex-col">
        <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading...</div>}>
          {sidebarTab === 'thumbnails' && <ThumbnailSidebar />}
          {sidebarTab === 'bookmarks' && <BookmarksSidebar />}
          {sidebarTab === 'comments' && <CommentsSidebar />}
          {sidebarTab === 'search' && <SearchPanel />}
        </Suspense>
        {sidebarTab === 'macros' && (
          capabilities.hasMacroConsole ? (
            <MacrosSidebar />
          ) : (
            <FeatureUnavailable reason="The macro console requires the local server. Start the server to enable macros." />
          )
        )}
        {sidebarTab === 'ocr' && <OcrPanelConnected />}
      </div>
    </div>
  );
};
