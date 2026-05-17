import React from 'react';
import {
  MousePointer2, Hand, Expand, Maximize, AlignJustify, FileIcon, Columns2,
  Highlighter, UnderlineIcon, Strikethrough, Activity, MessageSquare, MessageCircle,
  MessageSquareDot, Stamp, Square, ScanText, Eye, EyeOff,
  PenTool, Type, Circle, Hexagon, Cloud, Minus, MoveRight,
  Wand2, Sparkles, BrainCircuit, TableProperties, FileSearch, Info,
} from 'lucide-react';
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

// ── Primitive building blocks ────────────────────────────────────────────────

const CtxLabel: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => (
  <span
    className={[
      'text-[9.5px] font-semibold tracking-[0.6px] uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap select-none shrink-0',
      first ? 'pl-0.5 pr-1' : 'pl-2 pr-1',
    ].join(' ')}
  >
    {children}
  </span>
);

const CtxSep: React.FC = () => (
  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
);

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
  const base =
    'flex items-center gap-1 h-6 px-1.5 rounded-sm text-[11.5px] whitespace-nowrap cursor-pointer border-none shrink-0 transition-all';

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

  return (
    <button className={cls} title={title} onClick={onClick} disabled={disabled}>
      <Icon className="w-[13px] h-[13px] shrink-0" />
      {!iconOnly && label && <span>{label}</span>}
    </button>
  );
};

// ── Mode sections ────────────────────────────────────────────────────────────

const FileSection: React.FC = () => (
  <div className="flex items-center h-full">
    <CtxLabel first>Document</CtxLabel>
    <ToolbarFile />
    <CtxSep />
    <CtxLabel>Project</CtxLabel>
    <WriterV2ToolbarControls />
  </div>
);

const ViewSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore();
  const { viewState, setFitMode, setViewMode } = useSessionStore();

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

const AnnotateSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore();
  const { setActiveTool: setWriterActiveTool, activeTool: writerActiveTool } = useWriterStore();
  const { hideResolved, setHideResolved } = useReviewStore();

  const handleToolClick = (tool: ActiveTool) => {
    if (isToolDisabled(tool)) return;
    setWriterActiveTool('select');
    setActiveTool(activeTool === tool ? 'select' : tool);
  };

  const handleOcrClick = () => {
    if (writerActiveTool === 'ocr-region') {
      setWriterActiveTool('select');
    } else {
      setActiveTool('select');
      setWriterActiveTool('ocr-region');
    }
  };

  return (
    <>
      <CtxLabel first>Markup</CtxLabel>
      <CtxBtn icon={Highlighter} label="Highlight" active={activeTool === 'highlight'} onClick={() => handleToolClick('highlight')} />
      <CtxBtn icon={UnderlineIcon} label="Underline" active={activeTool === 'underline'} onClick={() => handleToolClick('underline')} />
      <CtxBtn icon={Strikethrough} label="Strikeout" active={activeTool === 'strikeout'} onClick={() => handleToolClick('strikeout')} />
      <CtxBtn icon={Activity} label="Squiggly" active={activeTool === 'squiggly'} disabled={isToolDisabled('squiggly')} title={getToolDisabledReason('squiggly') ?? 'Squiggly'} onClick={() => handleToolClick('squiggly')} />
      <CtxSep />
      <CtxLabel>Notes</CtxLabel>
      <CtxBtn icon={MessageSquare} label="Sticky Note" active={activeTool === 'sticky-note'} onClick={() => handleToolClick('sticky-note')} />
      <CtxBtn icon={MessageCircle} label="Comment" active={activeTool === 'comment'} onClick={() => handleToolClick('comment')} />
      <CtxBtn icon={MessageSquareDot} label="Callout" active={activeTool === 'callout'} onClick={() => handleToolClick('callout')} />
      <CtxSep />
      <CtxLabel>Mark</CtxLabel>
      <CtxBtn icon={Stamp} label="Stamp" active={activeTool === 'stamp'} disabled={isToolDisabled('stamp')} title={getToolDisabledReason('stamp') ?? 'Stamp'} onClick={() => handleToolClick('stamp')} />
      <CtxBtn icon={Square} label="Redact" active={activeTool === 'redaction'} onClick={() => handleToolClick('redaction')} />
      <CtxSep />
      <CtxLabel>Auto</CtxLabel>
      <CtxBtn icon={ScanText} label="OCR Region" active={writerActiveTool === 'ocr-region'} onClick={handleOcrClick} />
      <CtxSep />
      <CtxLabel>Visibility</CtxLabel>
      <CtxBtn icon={hideResolved ? EyeOff : Eye} label={hideResolved ? 'Resolved (hidden)' : 'Resolved'} active={hideResolved} onClick={() => setHideResolved(!hideResolved)} />
    </>
  );
};

const DrawSection: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore();
  const { setActiveTool: setWriterActiveTool } = useWriterStore();

  const handleToolClick = (tool: ActiveTool) => {
    if (isToolDisabled(tool)) return;
    setWriterActiveTool('select');
    setActiveTool(activeTool === tool ? 'select' : tool);
  };

  return (
    <>
      <CtxLabel first>Freehand</CtxLabel>
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
  const { setMacroBuilderOpen } = useEditorStore();
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
  const { activeMode } = useEditorStore();

  return (
    <div className="flex items-center h-[34px] min-h-[34px] shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
