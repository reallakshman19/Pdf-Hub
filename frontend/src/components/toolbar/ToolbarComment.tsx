import React from 'react';
import {
  Type,
  Highlighter,
  Underline as UnderlineIcon,
  Strikethrough,
  Circle,
  Square,
  Stamp,
  MessageSquare,
  Undo,
  Redo,
  MoveRight,
  Minus,
  MessageCircle,
  Eye,
  EyeOff,
  PenTool,
  Cloud,
  Hexagon,
  SquareSquare,
  Activity,
  AlignLeft,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Lock,
  ScanText,
  SquarePen,
} from 'lucide-react';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useReviewStore } from '@/core/review/store';
import { useWriterStore } from '@/core/writer/store';
import type { ActiveTool } from '@/core/editor/types';
import { Button } from '@/components/ui/Button';
import {
  getToolDisabledReason,
  isToolDisabled,
} from '@/core/tool-policy/disabledTools';
import { Tooltip } from '@/components/ui/Tooltip';
import { Separator } from '@/components/ui/Separator';

export const ToolbarComment: React.FC = () => {
  const { activeTool, setActiveTool } = useEditorStore();
  const writerActiveTool = useWriterStore((state) => state.activeTool);
  const setWriterActiveTool = useWriterStore((state) => state.setActiveTool);
  const {
    undo,
    redo,
    history,
    future,
    selectedAnnotationIds,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    alignSelection,
    distributeSelection,
    deleteSelection,
    toggleLockSelection,
  } = useAnnotationStore();

  const { viewState } = useSessionStore();
  const { hideResolved, setHideResolved } = useReviewStore();
  const hasSelection = selectedAnnotationIds.length > 0;

  const handleToolClick = (tool: Exclude<ActiveTool, 'select' | 'hand'>) => {
    if (isToolDisabled(tool)) {
      setWriterActiveTool('select');
      setActiveTool('select');
      return;
    }

    setWriterActiveTool('select');
    setActiveTool(activeTool === tool ? 'select' : tool);
  };

  const disabledTitle = (tool: ActiveTool, fallback: string) => {
    return getToolDisabledReason(tool) ?? fallback;
  };

  const disabledClass = (tool: ActiveTool) => {
    return isToolDisabled(tool) ? 'opacity-50 cursor-not-allowed' : '';
  };

  const handleOcrToolClick = () => {
    if (writerActiveTool === 'ocr-region') {
      setWriterActiveTool('select');
      return;
    }
    setActiveTool('select');
    setWriterActiveTool('ocr-region');
  };

  const handleWriterElementClick = () => {
    if (writerActiveTool === 'place-text') {
      setWriterActiveTool('select');
      return;
    }
    setActiveTool('select');
    setWriterActiveTool('place-text');
  };

  const getToolVariant = (tool: string) =>
    activeTool === tool ? 'secondary' : 'ghost';

  return (
    <div
      className="flex items-center space-x-1 shrink-0"
      role="toolbar"
      aria-label="Annotation tools"
    >
      <Tooltip content={disabledTitle('textbox', 'Text Box')}>
        <Button
          variant={getToolVariant('textbox')}
          size="icon"
          title={disabledTitle('textbox', 'Text Box')}
          aria-disabled={isToolDisabled('textbox')}
          className={disabledClass('textbox')}
          onClick={() => handleToolClick('textbox')}
        >
          <Type className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Writer Element">
        <Button
          variant={writerActiveTool === 'place-text' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={handleWriterElementClick}
        >
          <SquarePen className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Highlight">
        <Button variant={getToolVariant('highlight')} size="icon" onClick={() => handleToolClick('highlight')}>
          <Highlighter className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Underline">
        <Button variant={getToolVariant('underline')} size="icon" onClick={() => handleToolClick('underline')}>
          <UnderlineIcon className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Strikeout">
        <Button variant={getToolVariant('strikeout')} size="icon" onClick={() => handleToolClick('strikeout')}>
          <Strikethrough className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('squiggly', 'Squiggly Underline')}>
        <Button
          variant={getToolVariant('squiggly')}
          size="icon"
          title={disabledTitle('squiggly', 'Squiggly Underline')}
          aria-disabled={isToolDisabled('squiggly')}
          className={disabledClass('squiggly')}
          onClick={() => handleToolClick('squiggly')}
        >
          <Activity className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('ink', 'Freehand / Ink')}>
        <Button
          variant={getToolVariant('ink')}
          size="icon"
          title={disabledTitle('ink', 'Freehand / Ink')}
          aria-disabled={isToolDisabled('ink')}
          className={disabledClass('ink')}
          onClick={() => handleToolClick('ink')}
        >
          <PenTool className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('sticky-note', 'Sticky Note')}>
        <Button
          variant={getToolVariant('sticky-note')}
          size="icon"
          title={disabledTitle('sticky-note', 'Sticky Note')}
          aria-disabled={isToolDisabled('sticky-note')}
          className={disabledClass('sticky-note')}
          onClick={() => handleToolClick('sticky-note')}
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('comment', 'Comment Box')}>
        <Button
          variant={getToolVariant('comment')}
          size="icon"
          title={disabledTitle('comment', 'Comment Box')}
          aria-disabled={isToolDisabled('comment')}
          className={disabledClass('comment')}
          onClick={() => handleToolClick('comment')}
        >
          <MessageCircle className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('callout', 'Callout')}>
        <Button
          variant={getToolVariant('callout')}
          size="icon"
          title={disabledTitle('callout', 'Callout')}
          aria-disabled={isToolDisabled('callout')}
          className={disabledClass('callout')}
          onClick={() => handleToolClick('callout')}
        >
          <SquareSquare className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('shape-rect', 'Rectangle Shape')}>
        <Button
          variant={getToolVariant('shape-rect')}
          size="icon"
          title={disabledTitle('shape-rect', 'Rectangle Shape')}
          aria-disabled={isToolDisabled('shape-rect')}
          className={disabledClass('shape-rect')}
          onClick={() => handleToolClick('shape-rect')}
        >
          <Square className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('shape-ellipse', 'Ellipse Shape')}>
        <Button
          variant={getToolVariant('shape-ellipse')}
          size="icon"
          title={disabledTitle('shape-ellipse', 'Ellipse Shape')}
          aria-disabled={isToolDisabled('shape-ellipse')}
          className={disabledClass('shape-ellipse')}
          onClick={() => handleToolClick('shape-ellipse')}
        >
          <Circle className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('shape-polygon', 'Polygon Shape')}>
        <Button
          variant={getToolVariant('shape-polygon')}
          size="icon"
          title={disabledTitle('shape-polygon', 'Polygon Shape')}
          aria-disabled={isToolDisabled('shape-polygon')}
          className={disabledClass('shape-polygon')}
          onClick={() => handleToolClick('shape-polygon')}
        >
          <Hexagon className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('shape-cloud', 'Cloud Shape')}>
        <Button
          variant={getToolVariant('shape-cloud')}
          size="icon"
          title={disabledTitle('shape-cloud', 'Cloud Shape')}
          aria-disabled={isToolDisabled('shape-cloud')}
          className={disabledClass('shape-cloud')}
          onClick={() => handleToolClick('shape-cloud')}
        >
          <Cloud className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('redaction', 'Redaction')}>
        <Button
          variant={getToolVariant('redaction')}
          size="icon"
          title={disabledTitle('redaction', 'Redaction')}
          aria-disabled={isToolDisabled('redaction')}
          className={disabledClass('redaction')}
          onClick={() => handleToolClick('redaction')}
        >
          <Square className="w-4 h-4 fill-black" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('stamp', 'Stamp')}>
        <Button
          variant={getToolVariant('stamp')}
          size="icon"
          title={disabledTitle('stamp', 'Stamp')}
          aria-disabled={isToolDisabled('stamp')}
          className={disabledClass('stamp')}
          onClick={() => handleToolClick('stamp')}
        >
          <Stamp className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('line', 'Line')}>
        <Button
          variant={getToolVariant('line')}
          size="icon"
          title={disabledTitle('line', 'Line')}
          aria-disabled={isToolDisabled('line')}
          className={disabledClass('line')}
          onClick={() => handleToolClick('line')}
        >
          <Minus className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={disabledTitle('arrow', 'Arrow')}>
        <Button
          variant={getToolVariant('arrow')}
          size="icon"
          title={disabledTitle('arrow', 'Arrow')}
          aria-disabled={isToolDisabled('arrow')}
          className={disabledClass('arrow')}
          onClick={() => handleToolClick('arrow')}
        >
          <MoveRight className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="OCR Region (Auto-text)">
        <Button
          variant={writerActiveTool === 'ocr-region' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={handleOcrToolClick}
        >
          <ScanText className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip content="Copy">
        <Button variant="ghost" size="icon" onClick={copySelection} disabled={!hasSelection}>
          <Copy className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Paste">
        <Button variant="ghost" size="icon" onClick={() => pasteClipboard(viewState.currentPage)}>
          <ClipboardPaste className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Duplicate">
        <Button variant="ghost" size="icon" onClick={duplicateSelection} disabled={!hasSelection}>
          <CopyPlus className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete">
        <Button variant="ghost" size="icon" onClick={deleteSelection} disabled={!hasSelection} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
          <Trash2 className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip content="Align Left">
        <Button variant="ghost" size="icon" onClick={() => alignSelection('left')} disabled={selectedAnnotationIds.length < 2}>
          <AlignLeft className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Align Top">
        <Button variant="ghost" size="icon" onClick={() => alignSelection('top')} disabled={selectedAnnotationIds.length < 2}>
          <AlignLeft className="w-4 h-4 rotate-90" />
        </Button>
      </Tooltip>
      <Tooltip content="Distribute Horizontally">
        <Button variant="ghost" size="icon" onClick={() => distributeSelection('horizontal')} disabled={selectedAnnotationIds.length < 3}>
          <AlignHorizontalDistributeCenter className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Distribute Vertically">
        <Button variant="ghost" size="icon" onClick={() => distributeSelection('vertical')} disabled={selectedAnnotationIds.length < 3}>
          <AlignVerticalDistributeCenter className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip content="Lock / Unlock">
        <Button variant="ghost" size="icon" onClick={toggleLockSelection} disabled={!hasSelection}>
          <Lock className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip content="Undo">
        <Button variant="ghost" size="icon" onClick={undo} disabled={history.length === 0}>
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Redo">
        <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0}>
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip content={hideResolved ? "Show Resolved" : "Hide Resolved"}>
        <Button variant={hideResolved ? "secondary" : "ghost"} size="icon" onClick={() => setHideResolved(!hideResolved)}>
          {hideResolved ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      </Tooltip>
    </div>
  );
};
