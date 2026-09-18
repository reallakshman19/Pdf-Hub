import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Copy,
  Download,
  FilePlus2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { error as logError } from '@/core/logger/service';
import {
  getBuiltInMacroRecipes,
  type MacroRecipeCatalogItem,
} from '@/core/macro/recipes/builtInRecipes';
import {
  deleteCustomMacroRecipe,
  exportMacroRecipeJson,
  loadCustomMacroRecipes,
  subscribeCustomMacroRecipeChanges,
  upsertCustomMacroRecipe,
} from '@/core/macro/recipes/recipeStorage';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { validateRecipeBeforeRun } from '@/core/macro/validation/validator';
import { analyzeMacroWorkflowRisk } from '@/core/macro/risk';
import type { MacroOutputFile, MacroRecipe } from '@/core/macro/types';
import { downloadBlob } from '@/core/document/download';
import { PsIsonoteRecipeBuilder } from './PsIsonoteRecipeBuilder';
import { MacroGenerateDocumentPanel } from '@/components/macro/advanced/MacroGenerateDocumentPanel';
import {
  MacroOutputQueue,
  type MacroOutputQueueItem,
} from '@/components/macro/advanced/MacroOutputQueue';

type AutomateTab = 'quick' | 'workflows' | 'build';

const QUICK_ACTION_IDS = [
  'footer-page-numbers',
  'header-file-name',
  'rotate-selected-90',
  'extract-selected',
  'insert-review-cover',
] as const;

export const AutomateSidebar: React.FC = () => {
  const {
    workingBytes,
    fileName,
    pageCount,
    selectedPages,
    currentPage,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: state.viewState.currentPage,
  })));
  const addToast = useToastStore((state) => state.addToast);
  const {
    setMacroBuilderOpen,
    setMacroBuilderSource,
  } = useEditorStore(useShallow((state) => ({
    setMacroBuilderOpen: state.setMacroBuilderOpen,
    setMacroBuilderSource: state.setMacroBuilderSource,
  })));

  const builtIns = React.useMemo(() => getBuiltInMacroRecipes(), []);
  const quickActions = React.useMemo(
    () => QUICK_ACTION_IDS
      .map((id) => builtIns.find((item) => item.id === id))
      .filter((item): item is MacroRecipeCatalogItem => Boolean(item)),
    [builtIns],
  );

  const [tab, setTab] = React.useState<AutomateTab>('quick');
  const [customRecipes, setCustomRecipes] = React.useState<MacroRecipe[]>(() => loadCustomMacroRecipes());
  const [runningRecipeId, setRunningRecipeId] = React.useState<string | null>(null);
  const [specializedOpen, setSpecializedOpen] = React.useState(false);
  const [generatorOpen, setGeneratorOpen] = React.useState(false);
  const [generationBusy, setGenerationBusy] = React.useState(false);
  const [generatedOutputs, setGeneratedOutputs] = React.useState<MacroOutputQueueItem[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(
    () => subscribeCustomMacroRecipeChanges(setCustomRecipes),
    [],
  );

  React.useEffect(() => () => {
    abortRef.current?.abort('Automate panel unmounted');
  }, []);

  const openBuilder = (source: string) => {
    setMacroBuilderSource(source);
    setMacroBuilderOpen(true);
  };

  const runRecipe = async (recipe: MacroRecipe) => {
    if (!workingBytes || runningRecipeId || generationBusy) return;

    abortRef.current?.abort('Superseded by another workflow');
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningRecipeId(recipe.id);

    try {
      if (!fileName) return;

      const preflight = await validateRecipeBeforeRun(
        {
          ...recipe,
          dryRun: true,
        },
        {
          pageCount: Math.max(1, pageCount),
          selectedPages,
          currentPage,
          fileName,
          donorFiles: {},
          now: new Date(),
        },
      );

      if (!preflight.isValid) {
        addToast({
          type: 'error',
          title: 'Workflow Needs Attention',
          message: preflight.errors[0] ?? 'Fix the workflow before running it.',
        });
        return;
      }

      const result = await runMacroRecipeAgainstSession(
        {
          ...recipe,
          dryRun: false,
        },
        {
          saveOutputs: true,
          abortSignal: controller.signal,
        },
      );

      if (result.status === 'cancelled') {
        addToast({
          type: 'info',
          title: 'Workflow Cancelled',
          message: `${recipe.name} was cancelled before commit.`,
        });
        return;
      }

      if (result.status === 'failed' || result.success === false) {
        throw new Error(result.logs.at(-1) ?? 'Workflow failed.');
      }

      addToast({
        type: 'success',
        title: 'Workflow Complete',
        message: `${recipe.name} completed successfully.`,
      });
    } catch (runError) {
      if (controller.signal.aborted) return;
      const message = runError instanceof Error ? runError.message : String(runError);
      logError('macro', 'Automate workflow run failed', {
        recipeId: recipe.id,
        error: message,
      });
      addToast({
        type: 'error',
        title: 'Workflow Failed',
        message,
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunningRecipeId(null);
    }
  };

  const duplicateRecipe = (recipe: MacroRecipe) => {
    const copy: MacroRecipe = {
      ...JSON.parse(JSON.stringify(recipe)) as MacroRecipe,
      id: `${recipe.id}-copy-${Date.now()}`,
      name: `${recipe.name} Copy`,
    };
    upsertCustomMacroRecipe(copy);
    setCustomRecipes(loadCustomMacroRecipes());
    addToast({
      type: 'success',
      title: 'Workflow Duplicated',
      message: `${copy.name} is ready to edit.`,
    });
  };

  const exportRecipe = (recipe: MacroRecipe) => {
    const json = exportMacroRecipeJson(recipe);
    const safeName = recipe.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'workflow';

    downloadBlob(
      new Blob([json], { type: 'application/json;charset=utf-8' }),
      `${safeName}.pdfhub-workflow.json`,
    );
  };

  const removeRecipe = (recipe: MacroRecipe) => {
    deleteCustomMacroRecipe(recipe.id);
    setCustomRecipes(loadCustomMacroRecipes());
  };

  return (
    <div className="flex h-full flex-col" data-testid="automate-sidebar">
      <div className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <AutomateTabButton
          active={tab === 'quick'}
          onClick={() => setTab('quick')}
        >
          Quick Actions
        </AutomateTabButton>
        <AutomateTabButton
          active={tab === 'workflows'}
          onClick={() => setTab('workflows')}
        >
          My Workflows
        </AutomateTabButton>
        <AutomateTabButton
          active={tab === 'build'}
          onClick={() => setTab('build')}
        >
          Build
        </AutomateTabButton>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'quick' ? (
          <>
            <GenerateDocumentQuickAction
              open={generatorOpen}
              disabled={runningRecipeId !== null || generationBusy}
              outputs={generatedOutputs}
              onToggle={() => setGeneratorOpen((value) => !value)}
              onBusyChange={setGenerationBusy}
              onOutputsProduced={(outputs) => {
                setGeneratedOutputs((current) => [
                  ...current,
                  ...outputs.map((output) => ({
                    id: uuidv4(),
                    ...output,
                  })),
                ]);
              }}
              onOutputsChange={setGeneratedOutputs}
            />

            <QuickActions
              actions={quickActions}
              hasDocument={Boolean(workingBytes)}
              selectedPageCount={selectedPages.length}
              runningRecipeId={generationBusy ? '__generate__' : runningRecipeId}
              onRun={(recipe) => void runRecipe(recipe)}
              onCustomize={(item) => openBuilder(`builtin:${item.id}`)}
            />
          </>
        ) : null}

        {tab === 'workflows' ? (
          <WorkflowLibrary
            recipes={customRecipes}
            hasDocument={Boolean(workingBytes)}
            runningRecipeId={generationBusy ? '__generate__' : runningRecipeId}
            onRun={(recipe) => void runRecipe(recipe)}
            onEdit={(recipe) => openBuilder(`custom:${recipe.id}`)}
            onDuplicate={duplicateRecipe}
            onExport={exportRecipe}
            onDelete={removeRecipe}
            onCreate={() => openBuilder('new')}
          />
        ) : null}

        {tab === 'build' ? (
          <BuildWorkflowHome
            onCreate={() => openBuilder('new')}
          />
        ) : null}

        <details
          className="mt-4 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          open={specializedOpen}
          onToggle={(event) => setSpecializedOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Wrench className="h-3.5 w-3.5" />
            Specialized workflows
          </summary>
          {specializedOpen ? (
            <div className="border-t border-slate-100 dark:border-slate-800">
              <PsIsonoteRecipeBuilder />
            </div>
          ) : null}
        </details>


      </div>
    </div>
  );
};

function GenerateDocumentQuickAction({
  open,
  disabled,
  outputs,
  onToggle,
  onBusyChange,
  onOutputsProduced,
  onOutputsChange,
}: {
  open: boolean;
  disabled: boolean;
  outputs: MacroOutputQueueItem[];
  onToggle: () => void;
  onBusyChange: (busy: boolean) => void;
  onOutputsProduced: (outputs: MacroOutputFile[]) => void;
  onOutputsChange: (outputs: MacroOutputQueueItem[]) => void;
}) {
  return (
    <section
      className="mb-4"
      aria-label="Generate document"
      data-testid="automate-generate-document"
    >
      <article className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex items-start gap-2">
          <FilePlus2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-blue-950 dark:text-blue-100">
              Generate Document
            </div>
            <p className="mt-1 text-[11px] leading-4 text-blue-800 dark:text-blue-200">
              Create a document from a reusable template and save the generated PDF.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 h-7 text-xs"
          onClick={onToggle}
          disabled={disabled}
        >
          {open ? 'Close Generator' : 'Open Generator'}
        </Button>
      </article>

      {open ? (
        <div className="mt-2 space-y-2">
          <MacroGenerateDocumentPanel
            disabled={disabled}
            onBusyChange={onBusyChange}
            onOutputsProduced={onOutputsProduced}
          />
          <MacroOutputQueue
            outputs={outputs}
            onChange={onOutputsChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function AutomateTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      ].join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function QuickActions({
  actions,
  hasDocument,
  selectedPageCount,
  runningRecipeId,
  onRun,
  onCustomize,
}: {
  actions: MacroRecipeCatalogItem[];
  hasDocument: boolean;
  selectedPageCount: number;
  runningRecipeId: string | null;
  onRun: (recipe: MacroRecipe) => void;
  onCustomize: (item: MacroRecipeCatalogItem) => void;
}) {
  return (
    <section aria-label="Automate quick actions" data-testid="automate-quick-actions">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Quick Actions
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Common document tasks without recipe configuration.
        </p>
      </div>

      <div className="space-y-2">
        {actions.map((item) => {
          const running = runningRecipeId === item.recipe.id;
          const requiresSelection =
            item.id === 'rotate-selected-90'
            || item.id === 'extract-selected';
          const selectionMissing = requiresSelection && selectedPageCount === 0;

          return (
            <article
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                  {selectionMissing ? (
                    <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      Select one or more pages first.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!hasDocument || runningRecipeId !== null || selectionMissing}
                  onClick={() => onRun(item.recipe)}
                >
                  <Play className={['mr-1 h-3 w-3', running ? 'animate-pulse' : ''].join(' ')} />
                  {running ? 'Running…' : 'Run'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onCustomize(item)}
                >
                  Customize
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowLibrary({
  recipes,
  hasDocument,
  runningRecipeId,
  onRun,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
  onCreate,
}: {
  recipes: MacroRecipe[];
  hasDocument: boolean;
  runningRecipeId: string | null;
  onRun: (recipe: MacroRecipe) => void;
  onEdit: (recipe: MacroRecipe) => void;
  onDuplicate: (recipe: MacroRecipe) => void;
  onExport: (recipe: MacroRecipe) => void;
  onDelete: (recipe: MacroRecipe) => void;
  onCreate: () => void;
}) {
  if (recipes.length === 0) {
    return (
      <section className="text-center" data-testid="automate-workflow-library">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-950">
          <Sparkles className="mx-auto h-6 w-6 text-slate-400" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            No saved workflows
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Build a reusable sequence, test it, then save it here.
          </p>
          <Button size="sm" className="mt-3" onClick={onCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Build Workflow
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="automate-workflow-library">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            My Workflows
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Saved workflows available on this device.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onCreate}>
          <Plus className="mr-1 h-3 w-3" />
          New
        </Button>
      </div>

      <div className="space-y-2">
        {recipes.map((recipe) => {
          const requiresPreview =
            analyzeMacroWorkflowRisk(recipe).risk === 'preview-required';

          return (
          <article
            key={recipe.id}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {recipe.name}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {recipe.steps.length} step{recipe.steps.length === 1 ? '' : 's'}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!hasDocument || runningRecipeId !== null}
                onClick={() => {
                  if (requiresPreview) {
                    onEdit(recipe);
                    return;
                  }
                  onRun(recipe);
                }}
              >
                <Play className="mr-1 h-3 w-3" />
                {runningRecipeId === recipe.id
                  ? 'Running…'
                  : requiresPreview
                    ? 'Review & Run'
                    : 'Run'}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onEdit(recipe)}>
                Edit
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuplicate(recipe)} title="Duplicate workflow">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onExport(recipe)} title="Export workflow">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => onDelete(recipe)} title="Delete workflow">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function BuildWorkflowHome({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <section data-testid="automate-build-workflow">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h3 className="text-sm font-semibold text-blue-950 dark:text-blue-100">
          Build a workflow
        </h3>
        <p className="mt-1 text-xs leading-5 text-blue-800 dark:text-blue-200">
          Combine document actions, configure each step, Test Run against the open PDF, inspect impact, then Run or save it.
        </p>
        <Button className="mt-3" size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Open Workflow Builder
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        <div className="font-semibold text-slate-800 dark:text-slate-100">
          Builder flow
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <span>1.</span><span>Add actions from the palette</span>
          <span>2.</span><span>Configure and reorder steps</span>
          <span>3.</span><span>Test Run and inspect impact</span>
          <span>4.</span><span>Run or save for reuse</span>
        </div>
      </div>
    </section>
  );
}
