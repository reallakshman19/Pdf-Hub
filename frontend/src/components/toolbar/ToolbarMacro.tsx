import React from 'react';
import {
  PanelLeft,
  Sparkles,
  Hash,
  RotateCw,
  ChevronDown,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { BUILTIN_MACROS } from '@/core/macro/builtins';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { error as logError } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';

const BUILTIN_MENU_ITEMS: Array<{
  id: string;
  label: string;
  icon: React.ReactNode;
  action: 'run' | 'panel';
}> = [
  ...Object.values(BUILTIN_MACROS).map((recipe) => ({
    id: recipe.id,
    label: recipe.name,
    icon: <Sparkles className="w-3.5 h-3.5" />,
    action: 'run' as const,
  })),
  {
    id: '__open_panel__',
    label: 'Open Macro Panel',
    icon: <PanelLeft className="w-3.5 h-3.5" />,
    action: 'panel',
  },
];

export const ToolbarMacro: React.FC = () => {
  const { setSidebarTab } = useEditorStore();
  const { workingBytes } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const [runningRecipeId, setRunningRecipeId] = React.useState<string | null>(null);
  const [builtinsOpen, setBuiltinsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!builtinsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBuiltinsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [builtinsOpen]);

  const runRecipe = async (recipeId: string) => {
    if (!workingBytes) return;
    const recipe = BUILTIN_MACROS[recipeId];
    if (!recipe) return;

    setRunningRecipeId(recipe.id);
    setBuiltinsOpen(false);
    try {
      await runMacroRecipeAgainstSession(recipe, { saveOutputs: false });
      setSidebarTab('macros');
      addToast({
        type: 'success',
        title: 'Macro Complete',
        message: `${recipe.name} executed successfully.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('macro', 'Quick macro run from ribbon failed', { recipeId: recipe.id, error: message });
      addToast({ type: 'error', title: 'Macro Failed', message });
    } finally {
      setRunningRecipeId(null);
    }
  };

  const isMobile = useIsMobile();

  return (
    <div className="flex items-center gap-2">
      {/* Macro Panel button */}
      <Tooltip content="Open macro panel">
        <Button
          variant="secondary"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => setSidebarTab('macros')}
          className={isMobile ? 'h-8 w-8 min-w-[32px]' : 'h-8'}
          title="Open macro panel"
        >
          <PanelLeft className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          {!isMobile && 'Macro Panel'}
        </Button>
      </Tooltip>

      {/* Rotate 90 */}
      <Tooltip content="Rotate selected pages by 90 degrees">
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => void runRecipe('rotate_selected_90')}
          disabled={!workingBytes || runningRecipeId !== null}
          className={isMobile ? 'h-8 w-8 min-w-[32px]' : 'h-8'}
          title="Rotate selected pages by 90 degrees"
        >
          <RotateCw className={[
            isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1',
            runningRecipeId === 'rotate_selected_90' ? 'animate-spin' : '',
          ].join(' ')} />
          {!isMobile && 'Rotate 90'}
        </Button>
      </Tooltip>

      {/* Page Numbers quick-run */}
      <Tooltip content="Add page numbers to footer">
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => void runRecipe('add_page_numbers_footer')}
          disabled={!workingBytes || runningRecipeId !== null}
          className={isMobile ? 'h-8 w-8 min-w-[32px]' : 'h-8'}
          title="Add page numbers to footer"
        >
          <Hash className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          {!isMobile && 'Page Numbers'}
        </Button>
      </Tooltip>

      {/* Built-ins dropdown */}
      <div ref={dropdownRef} className="relative">
        <Tooltip content="Open built-in macro recipes">
          <Button
            variant="ghost"
            size={isMobile ? 'icon' : 'sm'}
            onClick={() => setBuiltinsOpen((v) => !v)}
            className={[
              isMobile ? 'h-8 w-8 min-w-[32px]' : 'h-8',
              builtinsOpen ? 'bg-slate-100 dark:bg-slate-800' : '',
            ].join(' ')}
            title="Open built-in macro recipes"
          >
            <Sparkles className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
            {!isMobile && (
              <>
                Built-ins
                <ChevronDown className={[
                  'w-3 h-3 ml-1 transition-transform',
                  builtinsOpen ? 'rotate-180' : '',
                ].join(' ')} />
              </>
            )}
          </Button>
        </Tooltip>

        {builtinsOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-[260px] max-h-[420px] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1"
          >
            {BUILTIN_MENU_ITEMS.map((item, idx) => {
              // Separator before the last item (Open Macro Panel)
              const isSeparated = idx === BUILTIN_MENU_ITEMS.length - 1;
              const isRunning = runningRecipeId === item.id;
              const disabled = item.action === 'run' && (!workingBytes || runningRecipeId !== null);

              return (
                <React.Fragment key={item.id}>
                  {isSeparated && (
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (item.action === 'panel') {
                        setSidebarTab('macros');
                        setBuiltinsOpen(false);
                      } else {
                        void runRecipe(item.id);
                      }
                    }}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                      disabled
                        ? 'opacity-40 cursor-not-allowed text-slate-400'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer',
                    ].join(' ')}
                  >
                    <span className={[
                      'shrink-0',
                      isRunning ? 'animate-spin' : '',
                      item.action === 'panel' ? 'text-blue-500' : 'text-slate-400',
                    ].join(' ')}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
