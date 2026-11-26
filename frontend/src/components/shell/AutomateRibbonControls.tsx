import React from 'react';
import {
  ChevronDown,
  FileText,
  Hash,
  Play,
  RotateCw,
  Stamp,
  Wand2,
  Workflow,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { HeaderFooterDialog } from '@/components/dialogs/HeaderFooterDialog';
import {
  ThumbnailMacroConfigDialog,
  type ThumbnailMacroKind,
} from '@/components/sidebar/thumbnails/ThumbnailMacroConfigDialog';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { error as logError } from '@/core/logger/service';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import {
  findBuiltInMacroRecipe,
  getBuiltInMacroRecipes,
} from '@/core/macro/recipes/builtInRecipes';
import {
  loadCustomMacroRecipes,
  subscribeCustomMacroRecipeChanges,
} from '@/core/macro/recipes/recipeStorage';
import { validateRecipeBeforeRun } from '@/core/macro/validation/validator';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import type { MacroRecipe } from '@/core/macro/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCapabilities } from '@/hooks/useCapabilities';

export const AutomateRibbonControls: React.FC = () => {
  const isMobile = useIsMobile();
  const capabilities = useCapabilities();
  const addToast = useToastStore((state) => state.addToast);
  const {
    leftPanelWidth,
    setLeftPanelWidth,
    setSidebarTab,
    setMacroBuilderOpen,
    setMacroBuilderSource,
  } = useEditorStore(
    useShallow((state) => ({
      leftPanelWidth: state.leftPanelWidth,
      setLeftPanelWidth: state.setLeftPanelWidth,
      setSidebarTab: state.setSidebarTab,
      setMacroBuilderOpen: state.setMacroBuilderOpen,
      setMacroBuilderSource: state.setMacroBuilderSource,
    })),
  );

  const {
    workingBytes,
    documentKey,
    fileName,
    pageCount,
    pageGraph,
    selectedPages,
    selectedPageIds,
    currentPage,
    currentPageId,
  } = useSessionStore(
    useShallow((state) => ({
      workingBytes: state.workingBytes,
      documentKey: state.documentKey,
      fileName: state.fileName,
      pageCount: state.pageCount,
      pageGraph: state.pageGraph,
      selectedPages: state.selectedPages,
      selectedPageIds: state.selectedPageIds,
      currentPage: state.viewState.currentPage,
      currentPageId: state.viewState.currentPageId,
    })),
  );

  const builtIns = React.useMemo(() => getBuiltInMacroRecipes(), []);
  const [customRecipes, setCustomRecipes] = React.useState<MacroRecipe[]>(() =>
    loadCustomMacroRecipes(),
  );
  const [running, setRunning] = React.useState(false);
  const [headerFooterOpen, setHeaderFooterOpen] = React.useState(false);
  const [customMacroKind, setCustomMacroKind] = React.useState<ThumbnailMacroKind | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuTriggerRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState({ top: 0, left: 0 });
  const hasDocument = Boolean(workingBytes && documentKey && pageGraph);

  React.useEffect(() => subscribeCustomMacroRecipeChanges(setCustomRecipes), []);

  React.useLayoutEffect(() => {
    if (!menuOpen || !menuTriggerRef.current) return;
    const rect = menuTriggerRef.current.getBoundingClientRect();
    const width = 264;
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuTriggerRef.current?.contains(target)) return;
      const menu = document.querySelector('[data-automate-workflows-menu="true"]');
      if (menu?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const openMacroStudio = (source = 'new') => {
    setMacroBuilderSource(source);
    setMacroBuilderOpen(true);
    setMenuOpen(false);
  };

  const openAutomatePanel = () => {
    setSidebarTab('macros');
    if (leftPanelWidth < 1) {
      setLeftPanelWidth(20);
    }
    setMenuOpen(false);
  };

  const runRecipe = async (recipe: MacroRecipe) => {
    if (!hasDocument || !fileName || running) return;
    setMenuOpen(false);
    setRunning(true);

    try {
      const preflight = await validateRecipeBeforeRun(
        { ...recipe, dryRun: true },
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
        { ...recipe, dryRun: false },
        { saveOutputs: true },
      );

      if (result.status === 'failed' || result.success === false) {
        throw new Error(result.logs.at(-1) ?? 'Workflow failed.');
      }

      addToast({
        type: 'success',
        title: 'Workflow Complete',
        message:
          result.outputFiles.length > 0
            ? `${recipe.name} completed (${result.outputFiles.length} output queued).`
            : `${recipe.name} completed successfully.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('macro', 'Automate ribbon workflow failed', {
        recipeId: recipe.id,
        error: message,
      });
      addToast({
        type: 'error',
        title: 'Workflow Failed',
        message,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleBuiltIn = (id: string) => {
    const found = findBuiltInMacroRecipe(id);
    if (!found) return;
    void runRecipe(found.recipe);
  };

  const handleRotate90 = async () => {
    if (!hasDocument || !documentKey || running) return;
    const pages = selectedPages.length > 0 ? selectedPages : [currentPage];
    const pageIndices = pages.map((page) => page - 1);
    setRunning(true);
    try {
      const result = await commandBus.execute({
        command: materializePdfCommand(
          { type: 'ROTATE_PAGES', payload: { pageIndices, angle: 90 } },
          'toolbar',
          documentKey,
        ),
      });
      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Rotate Failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }
      addToast({
        type: 'success',
        title: 'Pages Rotated',
        message: `Rotated ${pages.length} page(s) by 90°.`,
      });
    } finally {
      setRunning(false);
    }
  };

  const applyHeaderFooter = async (
    template: HeaderFooterTemplate,
    binaryResources?: Readonly<Record<string, Uint8Array>>,
  ): Promise<boolean> => {
    if (!documentKey || !pageGraph) return false;
    const result = await commandBus.execute({
      command: materializePdfCommand(
        { type: 'APPLY_HEADER_FOOTER_TEMPLATE', payload: { template } },
        'macro-runner',
        documentKey,
      ),
      ...(binaryResources ? { resources: { binaries: binaryResources } } : {}),
    });
    if (!result.success) {
      addToast({
        type: 'error',
        title: 'Header & Footer Failed',
        message: result.error?.message ?? result.message,
      });
      return false;
    }
    addToast({
      type: 'success',
      title: 'Header & Footer Applied',
      message: result.message,
    });
    return true;
  };

  const openCustomBuiltIn = (kind: ThumbnailMacroKind) => {
    setMenuOpen(false);
    setCustomMacroKind(kind);
  };

  const applyCustomMacro = async (commandDraft: PdfCommandDraft, successMessage: string) => {
    if (!documentKey) return;
    setCustomMacroKind(null);
    setRunning(true);
    try {
      const result = await commandBus.execute({
        command: materializePdfCommand(commandDraft, 'toolbar', documentKey),
      });
      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Built-in Action Failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }
      addToast({
        type: 'success',
        title: 'Built-in Applied',
        message: successMessage,
      });
    } finally {
      setRunning(false);
    }
  };

  const targetPageIndices =
    selectedPages.length > 0
      ? selectedPages.map((page) => page - 1)
      : Array.from({ length: Math.max(1, pageCount) }, (_, idx) => idx);
  const targetPageIds =
    selectedPageIds.length > 0
      ? selectedPageIds
      : pageGraph?.pages.map((page) => page.pageId) ?? [];

  const btnCls = (disabled?: boolean, highlight?: boolean) =>
    [
      'flex items-center gap-1 h-6 px-1.5 rounded-sm text-[11.5px] whitespace-nowrap cursor-pointer border-none shrink-0 transition-all',
      disabled
        ? 'opacity-40 pointer-events-none text-slate-500 dark:text-slate-400 bg-transparent'
        : highlight
          ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50 font-medium'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 bg-transparent',
    ].join(' ');

  return (
    <div className="flex items-center h-full gap-0.5" data-testid="automate-ribbon-controls">
      {!isMobile && (
        <span className="text-[9.5px] font-semibold tracking-[0.6px] uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap select-none shrink-0 pl-0.5 pr-1">
          Studio
        </span>
      )}

      {capabilities.canUseClientMacros && (
        <button
          type="button"
          onClick={() => openMacroStudio('new')}
          onMouseDown={(e) => e.preventDefault()}
          className={btnCls(false, true)}
          title="Open visual Macro Recipe Builder"
          data-testid="automate-open-macro-studio"
        >
          <Wand2 className="w-[13px] h-[13px] shrink-0" />
          <span>Macro Builder</span>
        </button>
      )}

      <button
        type="button"
        onClick={openAutomatePanel}
        onMouseDown={(e) => e.preventDefault()}
        className={btnCls(false)}
        title="Open Automate sidebar panel"
        data-testid="automate-open-panel"
      >
        <Workflow className="w-[13px] h-[13px] shrink-0" />
        <span>Automate Panel</span>
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

      {!isMobile && (
        <span className="text-[9.5px] font-semibold tracking-[0.6px] uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap select-none shrink-0 pl-1 pr-1">
          Built-ins
        </span>
      )}

      <button
        type="button"
        disabled={!hasDocument || running}
        onClick={() => setHeaderFooterOpen(true)}
        onMouseDown={(e) => e.preventDefault()}
        className={btnCls(!hasDocument || running)}
        title={hasDocument ? 'Configure header & footer content' : 'Open a PDF to apply headers and footers'}
        data-testid="automate-header-footer-btn"
      >
        <FileText className="w-[13px] h-[13px] shrink-0" />
        <span>Header &amp; Footer</span>
      </button>

      <button
        type="button"
        disabled={!hasDocument || running}
        onClick={() => handleBuiltIn('footer-page-numbers')}
        onMouseDown={(e) => e.preventDefault()}
        className={btnCls(!hasDocument || running)}
        title={hasDocument ? 'Stamp page numbers in footer on all pages' : 'Open a PDF to number pages'}
        data-testid="automate-page-numbers-btn"
      >
        <Hash className="w-[13px] h-[13px] shrink-0" />
        <span>Page Numbers</span>
      </button>

      <button
        type="button"
        disabled={!hasDocument || running}
        onClick={() => void handleRotate90()}
        onMouseDown={(e) => e.preventDefault()}
        className={btnCls(!hasDocument || running)}
        title={hasDocument ? 'Rotate current or selected pages 90° clockwise' : 'Open a PDF to rotate pages'}
        data-testid="automate-rotate-90-btn"
      >
        <RotateCw className="w-[13px] h-[13px] shrink-0" />
        <span>Rotate 90°</span>
      </button>

      <button
        type="button"
        disabled={!hasDocument || running}
        onClick={() => handleBuiltIn('review-current-page')}
        onMouseDown={(e) => e.preventDefault()}
        className={btnCls(!hasDocument || running)}
        title={hasDocument ? 'Stamp REVIEWED label on current page' : 'Open a PDF to apply stamp'}
        data-testid="automate-stamp-btn"
      >
        <Stamp className="w-[13px] h-[13px] shrink-0" />
        <span>Review Stamp</span>
      </button>

      <div ref={menuTriggerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          onMouseDown={(e) => e.preventDefault()}
          className={btnCls(false, menuOpen)}
          title="Run built-in or saved macro workflows"
          data-testid="automate-workflows-dropdown"
        >
          <Play className="w-[12px] h-[12px] shrink-0" />
          <span>{running ? 'Running…' : 'Workflows'}</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </div>

      {menuOpen && (
        <div
          data-automate-workflows-menu="true"
          role="menu"
          aria-label="Automate workflows"
          className="fixed z-[10000] w-[264px] max-h-[360px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {customRecipes.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                My Custom Workflows
              </div>
              {customRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  role="menuitem"
                  disabled={!hasDocument || running}
                  onClick={() => void runRecipe(recipe)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer border-none bg-transparent"
                >
                  <Play className="w-3 h-3 text-purple-500 shrink-0" />
                  <span className="truncate">{recipe.name}</span>
                </button>
              ))}
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            </>
          )}

          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Built-in Workflows
          </div>
          {builtIns.slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={!hasDocument || running}
              onClick={() => void runRecipe(item.recipe)}
              title={item.description}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer border-none bg-transparent"
            >
              <Play className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="truncate flex-1">{item.name}</span>
            </button>
          ))}

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Customize Built-ins
          </div>
          {(
            [
              { kind: 'pageNumbers', label: 'Custom Page Numbers…' },
              { kind: 'fileHeader', label: 'Custom File Header…' },
              { kind: 'textStamp', label: 'Batch Text Stamp…' },
              { kind: 'watermark', label: 'Diagonal Watermark…' },
            ] as const
          ).map((entry) => (
            <button
              key={entry.kind}
              type="button"
              role="menuitem"
              data-testid={`automate-custom-${entry.kind}`}
              disabled={!hasDocument || running}
              onClick={() => openCustomBuiltIn(entry.kind)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer border-none bg-transparent"
            >
              <Hash className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">{entry.label}</span>
            </button>
          ))}

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          {capabilities.canUseClientMacros && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openMacroStudio('new')}
              data-testid="automate-dropdown-open-builder"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/40 cursor-pointer border-none bg-transparent"
            >
              <Wand2 className="w-3.5 h-3.5 shrink-0" />
              <span>Open Visual Recipe Builder…</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={openAutomatePanel}
            data-testid="automate-dropdown-open-panel"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer border-none bg-transparent"
          >
            <Workflow className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span>Open Automate Panel</span>
          </button>
        </div>
      )}

      {pageGraph && customMacroKind && (
        <ThumbnailMacroConfigDialog
          kind={customMacroKind}
          pageIndices={targetPageIndices}
          pageIds={targetPageIds}
          allPageIds={pageGraph.pages.map((page) => page.pageId)}
          currentPageIndex={Math.max(0, currentPage - 1)}
          pageHeightPt={pageGraph.pages[Math.max(0, currentPage - 1)]?.height ?? 792}
          onCancel={() => setCustomMacroKind(null)}
          onApply={(draft, msg) => void applyCustomMacro(draft, msg)}
        />
      )}

      {pageGraph && headerFooterOpen && (
        <HeaderFooterDialog
          isOpen={headerFooterOpen}
          pageGraph={pageGraph}
          currentPageId={currentPageId}
          selectedPageIds={selectedPageIds}
          fileName={fileName ?? 'document.pdf'}
          onClose={() => setHeaderFooterOpen(false)}
          onApply={applyHeaderFooter}
        />
      )}
    </div>
  );
};
