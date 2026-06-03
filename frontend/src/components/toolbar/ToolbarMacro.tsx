import React from 'react';
import {
  PanelLeft,
  Sparkles,
  Hash,
  RotateCw,
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

export const ToolbarMacro: React.FC = () => {
  const { setSidebarTab } = useEditorStore();
  const { workingBytes } = useSessionStore();
  const addToast = useToastStore((state) => state.addToast);
  const [runningRecipeId, setRunningRecipeId] = React.useState<string | null>(null);

  const runRecipe = async (recipeId: keyof typeof BUILTIN_MACROS) => {
    if (!workingBytes) {
      return;
    }

    const recipe = BUILTIN_MACROS[recipeId];
    if (!recipe) {
      return;
    }

    setRunningRecipeId(recipe.id);
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
      logError('macro', 'Quick macro run from ribbon failed', {
        recipeId: recipe.id,
        error: message,
      });
      addToast({
        type: 'error',
        title: 'Macro Failed',
        message,
      });
    } finally {
      setRunningRecipeId(null);
    }
  };

  const isMobile = useIsMobile();

  return (
    <div className="flex items-center gap-2">
      <Tooltip content="Open macro panel">
        <Button
          variant="secondary"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => setSidebarTab('macros')}
          className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : 'h-8'}
          title="Open macro panel"
        >
          <PanelLeft className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          {!isMobile && 'Macro Panel'}
        </Button>
      </Tooltip>

      <Tooltip content="Rotate selected pages by 90 degrees">
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => void runRecipe('rotate_selected_90')}
          disabled={!workingBytes || runningRecipeId !== null}
          className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : 'h-8'}
          title="Rotate selected pages by 90 degrees"
        >
          {runningRecipeId === 'rotate_selected_90' ? (
            <RotateCw className={isMobile ? 'w-[18px] h-[18px] animate-spin' : 'w-4 h-4 mr-1 animate-spin'} />
          ) : (
            <RotateCw className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          )}
          {!isMobile && 'Rotate 90'}
        </Button>
      </Tooltip>

      <Tooltip content="Add page numbers to footer">
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => void runRecipe('add_page_numbers_footer')}
          disabled={!workingBytes || runningRecipeId !== null}
          className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : 'h-8'}
          title="Add page numbers to footer"
        >
          <Hash className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          {!isMobile && 'Page Numbers'}
        </Button>
      </Tooltip>

      <Tooltip content="Open built-in macro recipes">
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => setSidebarTab('macros')}
          className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : 'h-8'}
          title="Open built-in macro recipes"
        >
          <Sparkles className={isMobile ? 'w-[18px] h-[18px]' : 'w-4 h-4 mr-1'} />
          {!isMobile && 'Built-ins'}
        </Button>
      </Tooltip>
    </div>
  );
};
