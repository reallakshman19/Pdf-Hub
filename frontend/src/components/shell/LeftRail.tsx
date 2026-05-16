import React from 'react';
import {
  Bookmark,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import type { SidebarTab } from '@/core/editor/types';

export const LeftRail: React.FC = () => {
  const { sidebarTab, setSidebarTab } = useEditorStore();

  const allTabs: Array<{
    id: SidebarTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { id: 'thumbnails', icon: Layers, label: 'Pages' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'comments', icon: MessageSquare, label: 'Comments' },
    { id: 'macros', icon: Sparkles, label: 'Macros' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
  ];

  return (
    <div className="w-[52px] h-full flex flex-col items-center py-4 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
      {allTabs.map((tab) => {
        const isActive = sidebarTab === tab.id;
        const Icon = tab.icon;

        return (
          <Tooltip key={tab.id} content={tab.label} position="right">
            <button
              onClick={() => setSidebarTab(tab.id)}
              className={`relative p-2 transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white rounded-lg'
                  : 'text-slate-500 hover:bg-slate-100 rounded-lg'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};
