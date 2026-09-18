import React from 'react';
import {
  MousePointer2, Hand, Expand, Maximize, AlignJustify, FileIcon, Columns2,
  Highlighter, UnderlineIcon, Strikethrough, Activity, MessageSquare, MessageCircle,
  MessageSquareDot, Stamp, Square, ScanText, Eye, EyeOff,
  PenTool, Type, Circle, Hexagon, Cloud, Minus, MoveRight,
  Wand2, Sparkles, BrainCircuit, TableProperties, FileSearch, Info, MoreHorizontal,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useReviewStore } from '@/core/review/store';
import { useWriterStore } from '@/core/writer/store';
import { isToolDisabled, getToolDisabledReason } from '@/core/tool-policy/disabledTools';
import { resetInteractionState } from '@/core/editor/resetInteraction';
import { ToolbarOrganize } from '@/components/toolbar/ToolbarOrganize';
import { ToolbarMacro } from '@/components/toolbar/ToolbarMacro';
import { ToolbarFile } from '@/components/toolbar/ToolbarFile';
import { WriterV2ToolbarControls } from '@/components/writer-v2/WriterV2ToolbarControls';
import { useToastStore } from '@/core/toast/store';
import type { ActiveTool } from '@/core/editor/types';
import { useIsMobile } from '@/hooks/useIsMobile';

// Primitive building blocks
const CtxLabel: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return (
    <span
      className={[
        'text-[9.5px] font-semibold tracking-[0.6px] uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap select-none shrink-0',
        first ? 'pl-0.5 pr-1' : 'pl-2 pr-1',
      ].join(' ')}
    >
      {children}
    </span>
  );
};

const CtxSep: React.FC = () => {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return (
    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
  );
};

interface CtxBtnProps {
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  active?: boolean;
  danger?: boolean;
  ai?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  iconOnly?: boolean;
}

const CtxBtn: React.FC<CtxBtnProps> = ({
  icon: Icon,
  label,
  active,
  danger,
  ai,
  disabled,
  title,
  onClick,
  iconOnly,
}) => {
  const isMobile = useIsMobile();

  const base = isMobile && iconOnly
    ? 'flex items-center justify-center h-8 w-8 rounded-md whitespace-nowrap cursor-pointer border-none shrink-0 transition-all'
    : 'flex items-center gap-1 h-6 px-1.5 rounded-sm text-[11.5px] whitespace-nowrap cursor-pointer border-none shrink-0 transition-all';

  let cls = base;
  if (disabled) {
    cls += ' opacity-40 pointer-events-none text-slate-500 dark:text-slate-400';
  } else if (active && ai) {
    cls += ' bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400';
  } else if (active) {
    cls += ' bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-500';
  } else if (danger) {
    cls += ' text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 bg-transparent';
  } else {
    cls += ' text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 bg-transparent';
  }

  const iconSizeClass = isMobile && iconOnly ? 'w-[18px] h-[18px]' : 'w-[13px] h-[13px]';

  return (
    <button
      type="button"
      className={cls}
      title={title ?? label}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
    >
      <Icon className={[iconSizeClass, 'shrink-0'].join(' ')} />
      {!iconOnly && label && <span>{label}</span>}
    </button>
  );
};

// ── Mode sections ────────────────────────────────────────────────────────────

const FileSection: React.FC = () => (
  <div className="flex items-center h-full">
    <CtxLabel first>Document</CtxLabel>
    <ToolbarFile />
  </div>
);

const ViewSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore(useShallow((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  })));
  const { viewState, setFitMode, setViewMode } = useSessionStore(useShallow((state) => ({
    viewState: state.viewState,
    setFitMode: state.setFitMode,
    setViewMode: state.setViewMode,
  })));

  return (
    <>
      <CtxLabel first>Navigate</CtxLabel>
      <CtxBtn icon={MousePointer2} label="Select" active={activeTool === 'select'} onClick={() => resetInteractionState()} />
      <CtxBtn icon={Hand} label="Pan" active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} />
      <CtxSep />
      <CtxLabel>Fit</CtxLabel>
      <CtxBtn icon={Expand} label="Width" active={viewState.fitMode === 'width'} onClick={() => setFitMode('width')} />
      <CtxBtn icon={Maximize} label="Page" active={viewState.fitMode === 'page'} onClick={() => setFitMode('page')} />
      <CtxSep />
      <CtxLabel>Layout</CtxLabel>
      <CtxBtn icon={AlignJustify} label="Continuous" active={viewState.viewMode === 'continuous'} onClick={() => setViewMode('continuous')} />
      <CtxBtn icon={FileIcon} label="Single" active={viewState.viewMode === 'single'} onClick={() => setViewMode('single')} />
      <CtxBtn icon={Columns2} label="Two-Page" active={viewState.viewMode === 'two-page'} onClick={() => setViewMode('two-page')} />
    </>
  );
};

const ANNOTATE_MORE_TOOLS: Array<{
  id: ActiveTool | 'ocr-region';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { id: 'underline', label: 'Underline', icon: UnderlineIcon, description: 'Underline selected text' },
  { id: 'strikeout', label: 'Strikeout', icon: Strikethrough, description: 'Strike through selected text' },
  { id: 'squiggly', label: 'Squiggly', icon: Activity, description: 'Add a squiggly underline' },
  { id: 'sticky-note', label: 'Sticky Note', icon: MessageSquare, description: 'Place a compact note on the page' },
  { id: 'callout', label: 'Callout', icon: MessageSquareDot, description: 'Place a callout with leader line' },
  { id: 'stamp', label: 'Stamp', icon: Stamp, description: 'Place a document stamp' },
  { id: 'redaction', label: 'Visual Mask', icon: Square, description: 'Cover content visually; not secure redaction' },
  { id: 'ocr-region', label: 'OCR Area', icon: ScanText, description: 'Recognize a selected page region' },
];

const AnnotateSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore(useShallow((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  })));
  const { setActiveTool: setWriterActiveTool, activeTool: writerActiveTool } = useWriterStore();
  const { hideResolved, setHideResolved } = useReviewStore(useShallow((state) => ({
    hideResolved: state.hideResolved,
    setHideResolved: state.setHideResolved,
  })));
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0 });

  const handleToolClick = (tool: ActiveTool) => {
    if (isToolDisabled(tool)) return;
    setWriterActiveTool('select');
    setActiveTool(activeTool === tool ? 'select' : tool);
    setMoreOpen(false);
  };

  const handleOcrClick = () => {
    if (writerActiveTool === 'ocr-region') {
      setWriterActiveTool('select');
    } else {
      setActiveTool('select');
      setWriterActiveTool('ocr-region');
    }
    setMoreOpen(false);
  };

  React.useLayoutEffect(() => {
    if (!moreOpen || !moreRef.current) return;
    const rect = moreRef.current.getBoundingClientRect();
    const width = 238;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, [moreOpen]);

  React.useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (moreRef.current?.contains(target)) return;
      const menu = document.querySelector('[data-annotate-more-menu="true"]');
      if (menu?.contains(target)) return;
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  const secondaryActive =
    writerActiveTool === 'ocr-region'
    || ANNOTATE_MORE_TOOLS.some((item) => item.id !== 'ocr-region' && item.id === activeTool);

  return (
    <>
      <CtxLabel first>Review</CtxLabel>
      <CtxBtn
        icon={Highlighter}
        label="Highlight"
        active={activeTool === 'highlight'}
        onClick={() => handleToolClick('highlight')}
      />
      <CtxBtn
        icon={MessageCircle}
        label="Comment"
        active={activeTool === 'comment'}
        onClick={() => handleToolClick('comment')}
      />

      <div ref={moreRef} className="relative shrink-0">
        <CtxBtn
          icon={MoreHorizontal}
          label="More"
          active={secondaryActive || moreOpen}
          title="More annotation tools"
          onClick={() => setMoreOpen((open) => !open)}
        />
      </div>

      {moreOpen && (
        <div
          data-annotate-more-menu="true"
          role="menu"
          aria-label="More annotation tools"
          className="fixed z-[10000] w-[238px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {ANNOTATE_MORE_TOOLS.map((item) => {
            const Icon = item.icon;
            const isOcr = item.id === 'ocr-region';
            const active = isOcr
              ? writerActiveTool === 'ocr-region'
              : activeTool === item.id;
            const disabled = !isOcr && isToolDisabled(item.id as ActiveTool);
            const disabledReason = !isOcr
              ? getToolDisabledReason(item.id as ActiveTool)
              : null;

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={disabledReason ?? item.description}
                onClick={() => {
                  if (isOcr) handleOcrClick();
                  else handleToolClick(item.id as ActiveTool);
                }}
                className={[
                  'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                  disabled
                    ? 'cursor-not-allowed opacity-40'
                    : active
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    {disabledReason ?? item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <CtxSep />
      <CtxLabel>Visibility</CtxLabel>
      <CtxBtn
        icon={hideResolved ? EyeOff : Eye}
        label={hideResolved ? 'Show resolved' : 'Hide resolved'}
        active={hideResolved}
        onClick={() => setHideResolved(!hideResolved)}
      />
    </>
  );
};

const DrawSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore(useShallow((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  })));
  const { setActiveTool: setWriterActiveTool } = useWriterStore();

  const handleToolClick = (tool: ActiveTool) => {
    if (isToolDisabled(tool)) return;
    setWriterActiveTool('select');
    setActiveTool(activeTool === tool ? 'select' : tool);
  };

  return (
    <>
      <CtxLabel first>Ink</CtxLabel>
      <CtxBtn icon={PenTool} label="Ink" active={activeTool === 'ink'} onClick={() => handleToolClick('ink')} />
      <CtxBtn icon={Type} label="Text Box" active={activeTool === 'textbox'} disabled={isToolDisabled('textbox')} title={getToolDisabledReason('textbox') ?? 'Text Box'} onClick={() => handleToolClick('textbox')} />
      <CtxSep />
      <CtxLabel>Shapes</CtxLabel>
      <CtxBtn icon={Square} label="Rectangle" active={activeTool === 'shape-rect'} onClick={() => handleToolClick('shape-rect')} />
      <CtxBtn icon={Circle} label="Ellipse" active={activeTool === 'shape-ellipse'} onClick={() => handleToolClick('shape-ellipse')} />
      <CtxBtn icon={Hexagon} label="Polygon" active={activeTool === 'shape-polygon'} onClick={() => handleToolClick('shape-polygon')} />
      <CtxBtn icon={Cloud} label="Cloud" active={activeTool === 'shape-cloud'} onClick={() => handleToolClick('shape-cloud')} />
      <CtxSep />
      <CtxLabel>Lines</CtxLabel>
      <CtxBtn icon={Minus} label="Line" active={activeTool === 'line'} onClick={() => handleToolClick('line')} />
      <CtxBtn icon={MoveRight} label="Arrow" active={activeTool === 'arrow'} onClick={() => handleToolClick('arrow')} />
    </>
  );
};

const WriteSection: React.FC = () => (
  <div className="flex items-center h-full gap-2">
    <CtxLabel first>Writer Tools</CtxLabel>
    <WriterV2ToolbarControls />
    <CtxSep />
    <div className="flex items-center gap-1 text-[10.5px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 shrink-0 select-none">
      <Info className="w-3 h-3 shrink-0" />
      <span>Overlay only — does not edit existing PDF text</span>
    </div>
  </div>
);

const OrganizeSection: React.FC = () => (
  <div className="flex items-center h-full">
    <ToolbarOrganize />
  </div>
);

const GenerateSection: React.FC = () => {
  const { setMacroBuilderOpen } = useEditorStore(useShallow((state) => ({
    setMacroBuilderOpen: state.setMacroBuilderOpen,
  })));
  const addToast = useToastStore((s) => s.addToast);
  const stub = (name: string) => () =>
    addToast({ type: 'info', title: `${name} (Preview)`, message: `${name} requires AI backend integration and is not yet available.` });
  return (
    <div className="flex items-center h-full">
      <CtxLabel first>AI Tools</CtxLabel>
      <CtxBtn icon={Wand2} label="Builder" ai onClick={() => setMacroBuilderOpen(true)} />
      <CtxBtn icon={Sparkles} label="Smart Fill" ai onClick={stub('Smart Fill')} />
      <CtxBtn icon={BrainCircuit} label="Ask AI" ai onClick={stub('Ask AI')} />
      <CtxSep />
      <CtxLabel>Extract</CtxLabel>
      <CtxBtn icon={TableProperties} label="Extract Fields" ai onClick={stub('Extract Fields')} />
      <CtxBtn icon={FileSearch} label="Summarize" ai onClick={stub('Summarize')} />
      <CtxSep />
      <ToolbarMacro />
    </div>
  );
};

// ── CtxBar shell ─────────────────────────────────────────────────────────────

export const CtxBar: React.FC = () => {
  const { activeMode } = useEditorStore(useShallow((state) => ({
    activeMode: state.activeMode,
  })));
  const isMobile = useIsMobile();

  return (
    <div
      className={[
        "flex items-center shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        isMobile ? "h-10 min-h-10" : "h-[34px] min-h-[34px]"
      ].join(" ")}
    >
      {activeMode === 'file' && <FileSection />}
      {activeMode === 'view' && <ViewSection />}
      {activeMode === 'annotate' && <AnnotateSection />}
      {activeMode === 'draw' && <DrawSection />}
      {activeMode === 'write' && <WriteSection />}
      {activeMode === 'organize' && <OrganizeSection />}
      {activeMode === 'generate' && <GenerateSection />}
    </div>
  );
};
