import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import type { AnnotationType, PdfAnnotation } from '@/core/annotations/types';
import { ANNOTATION_TYPES } from '@/core/annotations/annotationTypes';
import { Settings, Palette, Info, ChevronRight, ChevronLeft, ChevronDown, MessageSquare, Minus, X } from 'lucide-react';
import { WriterInspectorPanel } from '@/components/writer/WriterInspectorPanel';
import { useWriterStore } from '@/core/writer/store';
import type { ReviewStatus } from '@/core/review/types';
import { getAnnotationReviewStatus } from '@/core/review/annotationReview';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';


export const InspectorPanel: React.FC = () => {
  const { inspectorTab, setInspectorTab, rightPanelWidth, setRightPanelWidth, activeMode } = useEditorStore(useShallow((state) => ({
    inspectorTab: state.inspectorTab,
    setInspectorTab: state.setInspectorTab,
    rightPanelWidth: state.rightPanelWidth,
    setRightPanelWidth: state.setRightPanelWidth,
    activeMode: state.activeMode,
  })));
  const {
    annotations,
    selectedAnnotationIds,
    activeAnnotationId,
    updateAnnotation,
    updateManyAnnotations,
    deleteSelection,
    setReviewStatusForSelection,
    toggleLockSelection,
  } = useAnnotationStore(useShallow((state) => ({
    annotations: state.annotations,
    selectedAnnotationIds: state.selectedAnnotationIds,
    activeAnnotationId: state.activeAnnotationId,
    updateAnnotation: state.updateAnnotation,
    updateManyAnnotations: state.updateManyAnnotations,
    deleteSelection: state.deleteSelection,
    setReviewStatusForSelection: state.setReviewStatusForSelection,
    toggleLockSelection: state.toggleLockSelection,
  })));

  const writerSelectedIds = useWriterStore(s => s.selectedIds);
  const writerActiveTool = useWriterStore(s => s.activeTool);

  const [previousWidth, setPreviousWidth] = useState(18);
  const isCollapsed = rightPanelWidth <= 0.1;

  const selection = useMemo(
    () => annotations.filter((annotation) => selectedAnnotationIds.includes(annotation.id)),
    [annotations, selectedAnnotationIds],
  );

  const activeAnnotation =
    annotations.find((annotation) => annotation.id === activeAnnotationId) ?? selection[0] ?? null;

  const toggleCollapse = () => {
    if (isCollapsed) {
      setRightPanelWidth(previousWidth < 10 ? 18 : previousWidth);
    } else {
      setPreviousWidth(rightPanelWidth);
      setRightPanelWidth(0);
    }
  };

  // Only show the writer inspector in write mode when a writer element is selected
  const isWriterActive = activeMode === 'write' && ['select', 'place-text', 'place-image', 'place-table'].includes(writerActiveTool);
  if (isWriterActive && writerSelectedIds.length > 0) {
    return <WriterInspectorPanel />;
  }

  if (isCollapsed) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <Tooltip content="Expand inspector">
          <Button
            data-testid="inspector-collapse-btn"
            variant="secondary"
            size="icon"
            onClick={toggleCollapse}
            className="shadow-md rounded-full h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  const tabs = [
    { id: 'properties', icon: Settings, label: 'Properties' },
    { id: 'style', icon: Palette, label: 'Style' },
    { id: 'history', icon: Info, label: 'Metadata' },
    { id: 'review', icon: MessageSquare, label: 'Review' },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Inspector
        </h2>
        <Tooltip content="Collapse inspector">
          <Button
            data-testid="inspector-collapse-btn"
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-2"
            onClick={toggleCollapse}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
        {selection.length > 1 ? `${selection.length} annotations selected` : activeAnnotation ? '1 annotation selected' : 'No selection'}
      </div>

      <div className="flex items-center p-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-md w-full">
          {tabs.map((tab) => {
            const isActive = inspectorTab === tab.id;
            const Icon = tab.icon;
            return (
              <div key={tab.id} className="flex-1">
                <Tooltip content={tab.label}>
                  <button
                    onClick={() => setInspectorTab(tab.id)}
                    className={`w-full flex items-center justify-center py-1.5 rounded-sm transition-colors ${
                      isActive
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                    title={tab.label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto relative">
        {!activeAnnotation && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 text-center">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">No selection</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select an annotation to edit it.
              </div>
            </div>
          </div>
        )}

        {activeAnnotation && inspectorTab === 'properties' && (
          <PropertiesTab
            annotation={activeAnnotation}
            updateAnnotation={updateAnnotation}
            deleteSelection={deleteSelection}
            setReviewStatusForSelection={setReviewStatusForSelection}
            toggleLockSelection={toggleLockSelection}
          />
        )}

        {activeAnnotation && inspectorTab === 'style' && (
          <StyleTab
            annotation={activeAnnotation}
          />
        )}

        {activeAnnotation && inspectorTab === 'history' && (
          <MetadataTab annotation={activeAnnotation} />
        )}

        {inspectorTab === 'review' && (
          <ReviewTab
            activeAnnotation={activeAnnotation}
            selection={selection}
            updateAnnotation={updateAnnotation}
            updateManyAnnotations={updateManyAnnotations}
          />
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {title}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
};

const ReviewTab: React.FC<{
  activeAnnotation: PdfAnnotation | null;
  selection: PdfAnnotation[];
  updateAnnotation: (id: string, data: Partial<PdfAnnotation>) => void;
  updateManyAnnotations: (updates: Array<{ id: string; data: Partial<PdfAnnotation> }>) => void;
}> = ({ activeAnnotation, selection, updateAnnotation, updateManyAnnotations }) => {
  if (selection.length > 1) {
    return (
      <div className="p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Bulk Actions</h3>
        <p className="text-xs text-slate-500 mb-4">{selection.length} annotations selected</p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const patches = selection.map(a => ({
                id: a.id,
                data: {
                  data: {
                    ...a.data,
                    review: {
                      ...(a.data.review || { author: 'Unknown', createdAt: Date.now(), replies: [] }),
                      status: 'resolved' as ReviewStatus,
                      updatedAt: Date.now()
                    }
                  }
                }
              }));
              updateManyAnnotations(patches);
            }}
          >
            Resolve All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const patches = selection.map(a => ({
                id: a.id,
                data: {
                  data: {
                    ...a.data,
                    review: {
                      ...(a.data.review || { author: 'Unknown', createdAt: Date.now(), replies: [] }),
                      status: 'open' as ReviewStatus,
                      updatedAt: Date.now()
                    }
                  }
                }
              }));
              updateManyAnnotations(patches);
            }}
          >
            Reopen All
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const patches = selection.map(a => ({
                id: a.id,
                data: {
                  data: {
                    ...a.data,
                    review: {
                      ...(a.data.review || { author: 'Unknown', createdAt: Date.now(), replies: [] }),
                      status: 'rejected' as ReviewStatus,
                      updatedAt: Date.now()
                    }
                  }
                }
              }));
              updateManyAnnotations(patches);
            }}
          >
            Reject All
          </Button>
        </div>
      </div>
    );
  }

  if (!activeAnnotation) return null;

  return (
    <div className="p-4 space-y-6">
      <Section title="Review Status">
        <LabeledSelect
          label="Status"
          value={getAnnotationReviewStatus(activeAnnotation)}
          onChange={(value) => {
            updateAnnotation(activeAnnotation.id, {
              data: {
                ...activeAnnotation.data,
                review: {
                  ...(activeAnnotation.data.review || { author: 'Current User', createdAt: Date.now(), replies: [] }),
                  status: value as ReviewStatus,
                  updatedAt: Date.now()
                }
              }
            });
          }}
          options={[
            { label: 'Open', value: 'open' },
            { label: 'Resolved', value: 'resolved' },
            { label: 'Rejected', value: 'rejected' },
          ]}
        />

        <LabeledInputShell label="Author">
          <input
            type="text"
            className={baseInputClass}
            value={activeAnnotation.data.review?.author || ''}
            placeholder="e.g. Alice"
            onChange={(e) => {
              updateAnnotation(activeAnnotation.id, {
                data: {
                  ...activeAnnotation.data,
                  review: {
                    ...(activeAnnotation.data.review || { status: 'open' as ReviewStatus, createdAt: Date.now(), replies: [] }),
                    author: e.target.value,
                    updatedAt: Date.now()
                  }
                }
              });
            }}
          />
        </LabeledInputShell>

        <LabeledInputShell label="Title (Optional)">
          <input
            type="text"
            className={baseInputClass}
            value={activeAnnotation.data.review?.title || ''}
            placeholder="Review Title"
            onChange={(e) => {
              updateAnnotation(activeAnnotation.id, {
                data: {
                  ...activeAnnotation.data,
                  review: {
                    ...(activeAnnotation.data.review || { author: 'Current User', status: 'open' as ReviewStatus, createdAt: Date.now(), replies: [] }),
                    title: e.target.value,
                    updatedAt: Date.now()
                  }
                }
              });
            }}
          />
        </LabeledInputShell>

        <LabeledInputShell label="Category (Optional)">
          <input
            type="text"
            className={baseInputClass}
            value={activeAnnotation.data.review?.category || ''}
            placeholder="e.g. Design, Grammar"
            onChange={(e) => {
              updateAnnotation(activeAnnotation.id, {
                data: {
                  ...activeAnnotation.data,
                  review: {
                    ...(activeAnnotation.data.review || { author: 'Current User', status: 'open' as ReviewStatus, createdAt: Date.now(), replies: [] }),
                    category: e.target.value,
                    updatedAt: Date.now()
                  }
                }
              });
            }}
          />
        </LabeledInputShell>
      </Section>

    </div>
  );
};

const PropertiesTab: React.FC<{
  annotation: PdfAnnotation;
  updateAnnotation: (id: string, data: Partial<PdfAnnotation>) => void;
  deleteSelection: () => void;
  setReviewStatusForSelection: (status: 'open' | 'resolved' | 'rejected') => void;
  toggleLockSelection: () => void;
}> = ({
  annotation,
  updateAnnotation,
  deleteSelection,
  setReviewStatusForSelection,
  toggleLockSelection,
}) => {
  const updateRect = (key: 'x' | 'y' | 'width' | 'height', value: string) => {
    const next = Number(value);
    if (Number.isNaN(next)) {
      return;
    }
    updateAnnotation(annotation.id, {
      rect: {
        ...annotation.rect,
        [key]: next,
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="General" />
        <Button variant="ghost" size="sm" onClick={deleteSelection} className="text-red-600">
          Delete
        </Button>
      </div>

      <LabeledSelect
        label="Type"
        value={annotation.type}
        onChange={(value) => updateAnnotation(annotation.id, { type: value as AnnotationType })}
        options={ANNOTATION_TYPES.map((type) => ({ label: type, value: type }))}
      />

      <TwoColumnRow>
        <LabeledNumberInput label="X" value={annotation.rect.x} onChange={(v) => updateRect('x', v)} />
        <LabeledNumberInput label="Y" value={annotation.rect.y} onChange={(v) => updateRect('y', v)} />
      </TwoColumnRow>

      <TwoColumnRow>
        <LabeledNumberInput label="Width" value={annotation.rect.width} onChange={(v) => updateRect('width', v)} />
        <LabeledNumberInput label="Height" value={annotation.rect.height} onChange={(v) => updateRect('height', v)} />
      </TwoColumnRow>

      <LabeledNumberInput
        label="Rotation"
        value={typeof annotation.data.rotation === 'number' ? annotation.data.rotation : 0}
        onChange={(value) => {
          const next = Number(value);
          if (Number.isNaN(next)) {
            return;
          }
          updateAnnotation(annotation.id, {
            data: { ...annotation.data, rotation: next },
          });
        }}
      />

      <LabeledSelect
        label="Review Status"
        value={getAnnotationReviewStatus(annotation)}
        onChange={(value) =>
          setReviewStatusForSelection(value as 'open' | 'resolved' | 'rejected')
        }
        options={[
          { label: 'open', value: 'open' },
          { label: 'resolved', value: 'resolved' },
          { label: 'rejected', value: 'rejected' },
        ]}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={annotation.data.locked === true}
          onChange={() => toggleLockSelection()}
        />
        Locked
      </label>

      {isTextLike(annotation.type) && (
        <LabeledTextarea
          label="Text"
          value={typeof annotation.data.text === 'string' ? annotation.data.text : ''}
          onChange={(value) =>
            updateAnnotation(annotation.id, {
              data: { ...annotation.data, text: value },
            })
          }
        />
      )}
    </div>
  );
};

const StyleTab: React.FC<{
  annotation: PdfAnnotation;
}> = ({ annotation }) => {
  const { updateStyleForSelection } = useAnnotationStore(useShallow((state) => ({
    updateStyleForSelection: state.updateStyleForSelection,
  })));

  const applyToSelection = (dataPatch: Record<string, unknown>) => {
    updateStyleForSelection(dataPatch);
  };

  const isTextLike = ['textbox', 'callout', 'sticky-note'].includes(annotation.type);
  const isLineLike = ['line', 'arrow'].includes(annotation.type);
  const isCallout = annotation.type === 'callout';
  const defaultLineEndCap = annotation.type === 'arrow' ? 'arrow' : 'none';

  return (
    <div className="p-4 space-y-4">
      <Section title="Appearance">
        <TwoColumnRow>
          <LabeledColorInput
            label="Background"
            value={readColor(annotation.data.backgroundColor, '#ffffff')}
            onChange={(value) => applyToSelection({ backgroundColor: value })}
          />
          <LabeledColorInput
            label="Border"
            value={readColor(annotation.data.borderColor, '#60a5fa')}
            onChange={(value) => applyToSelection({ borderColor: value })}
          />
        </TwoColumnRow>

        <div className="my-2">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Border Style</span>
          <BorderStylePicker
            value={typeof annotation.data.borderStyle === 'string' ? annotation.data.borderStyle : 'solid'}
            onChange={(val) => applyToSelection({ borderStyle: val })}
          />
        </div>

        <TwoColumnRow>
          <LabeledNumberInput
            label="Border Width"
            value={typeof annotation.data.borderWidth === 'number' ? annotation.data.borderWidth : 1}
            onChange={(value) => {
              const next = Number(value);
              if (!Number.isNaN(next)) applyToSelection({ borderWidth: next });
            }}
          />
          <LabeledNumberInput
            label="Opacity"
            value={typeof annotation.data.opacity === 'number' ? annotation.data.opacity : 1}
            onChange={(value) => {
              const next = Number(value);
              if (!Number.isNaN(next)) applyToSelection({ opacity: next });
            }}
          />
        </TwoColumnRow>
      </Section>

      {isTextLike && (
        <Section title="Typography">
          <TwoColumnRow>
            <LabeledColorInput
              label="Text Color"
              value={readColor(annotation.data.textColor, '#0f172a')}
              onChange={(value) => applyToSelection({ textColor: value })}
            />
            <LabeledNumberInput
              label="Font Size"
              value={typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 12}
              onChange={(value) => {
                const next = Number(value);
                if (!Number.isNaN(next)) applyToSelection({ fontSize: next });
              }}
            />
          </TwoColumnRow>
          <LabeledSelect
            label="Text Align"
            value={typeof annotation.data.textAlign === 'string' ? annotation.data.textAlign : 'left'}
            onChange={(value) => applyToSelection({ textAlign: value })}
            options={[
              { label: 'left', value: 'left' },
              { label: 'center', value: 'center' },
              { label: 'right', value: 'right' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={annotation.data.autoSize !== false}
              onChange={(event) => applyToSelection({ autoSize: event.target.checked })}
            />
            Auto-size text box
          </label>
        </Section>
      )}

      {isCallout && (
        <Section title="Leader">
          <div className="space-y-3">
            <LabeledSelect
              label="Style"
              value={typeof annotation.data.leaderStyle === 'string' ? annotation.data.leaderStyle : 'elbow'}
              onChange={(val) => applyToSelection({ leaderStyle: val })}
              options={[{ label: 'Elbow (3-pt)', value: 'elbow' }, { label: 'Straight (2-pt)', value: 'straight' }]}
            />
            <LabeledSelect
              label="Arrowhead"
              value={typeof annotation.data.arrowHead === 'string' ? annotation.data.arrowHead : 'open'}
              onChange={(val) => applyToSelection({ arrowHead: val })}
              options={[{ label: 'Open', value: 'open' }, { label: 'Filled', value: 'filled' }, { label: 'None', value: 'none' }]}
            />
          </div>
        </Section>
      )}

      {isLineLike && (
        <Section title="Line Ends">
          <div className="space-y-3">
            <LineCapPicker
              label="Start"
              value={readLineCap(annotation.data.lineStartCap, 'none')}
              onChange={(v) => applyToSelection({ lineStartCap: v })}
            />
            <LineCapPicker
              label="End"
              value={readLineCap(annotation.data.lineEndCap, defaultLineEndCap)}
              onChange={(v) => applyToSelection({ lineEndCap: v })}
            />
          </div>
        </Section>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={annotation.data.locked === true}
          onChange={(event) => applyToSelection({ locked: event.target.checked })}
        />
        Locked
      </label>

      <Section title="Quick Presets" defaultOpen={false}>
        <div className="grid grid-cols-4 gap-2">
          {['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#d946ef'].map((color) => (
            <button
              key={color}
              className="w-full aspect-square rounded-md border border-slate-200 dark:border-slate-800 transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              onClick={() => applyToSelection({ backgroundColor: color, borderColor: color })}
            />
          ))}
        </div>
      </Section>
    </div>
  );
};

const MetadataTab: React.FC<{ annotation: PdfAnnotation }> = ({ annotation }) => (
  <div className="p-4 space-y-3">
    <SectionTitle title="Metadata" />
    <KeyValue label="ID" value={annotation.id} mono />
    <KeyValue label="Type" value={annotation.type} />
    <KeyValue label="Page" value={String(annotation.pageNumber)} />
    <KeyValue label="Created" value={new Date(annotation.createdAt).toLocaleString()} />
    <KeyValue label="Updated" value={new Date(annotation.updatedAt).toLocaleString()} />
  </div>
);

function isTextLike(type: AnnotationType): boolean {
  return (
    type === 'textbox' ||
    type === 'comment' ||
    type === 'stamp' ||
    type === 'callout' ||
    type === 'sticky-note'
  );
}

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
    {title}
  </div>
);

const TwoColumnRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-3">{children}</div>
);

const baseInputClass =
  'w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

const LabeledInputShell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
    {children}
  </label>
);

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'none'] as const;
const BorderStylePicker: React.FC<{
  value: string; onChange: (v: string) => void
}> = ({ value, onChange }) => (
  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg gap-1">
    {BORDER_STYLES.map(style => (
      <button
        key={style}
        title={style}
        onClick={() => onChange(style)}
        className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-[10px] transition-all ${
          value === style
            ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 font-semibold'
            : 'text-slate-400'
        }`}
      >
        {style === 'solid' && <Minus className="w-4 h-1" strokeWidth={3} />}
        {style === 'dashed' && <span style={{ borderTop: '2px dashed currentColor', width: 20 }} />}
        {style === 'dotted' && <span style={{ borderTop: '2px dotted currentColor', width: 20 }} />}
        {style === 'none' && <X className="w-3 h-3" />}
      </button>
    ))}
  </div>
);

type LineCap = 'none' | 'arrow' | 'circle' | 'square';
function readLineCap(value: unknown, fallback: LineCap): LineCap {
  if (value === 'none' || value === 'arrow' || value === 'circle' || value === 'square') {
    return value;
  }
  return fallback;
}
const CAP_LABELS: Record<LineCap, string> = {
  none: '—', arrow: '▶', circle: '●', square: '■'
};
const LineCapPicker: React.FC<{
  label: string; value: LineCap; onChange: (v: LineCap) => void
}> = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
    <div className="flex gap-1">
      {(Object.keys(CAP_LABELS) as LineCap[]).map(cap => (
        <button
          key={cap}
          onClick={() => onChange(cap)}
          className={`flex-1 py-1.5 rounded-lg text-sm border transition-all ${
            value === cap
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600'
              : 'border-slate-200 dark:border-slate-700 text-slate-500'
          }`}
        >
          {CAP_LABELS[cap]}
        </button>
      ))}
    </div>
  </div>
);

const LabeledNumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <LabeledInputShell label={label}>
    <input type="number" className={baseInputClass} value={value} onChange={(e) => onChange(e.target.value)} />
  </LabeledInputShell>
);

const LabeledSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}> = ({ label, value, onChange, options }) => (
  <LabeledInputShell label={label}>
    <select className={baseInputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </LabeledInputShell>
);

const LabeledTextarea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <LabeledInputShell label={label}>
    <textarea
      className={`${baseInputClass} min-h-[90px] resize-y`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </LabeledInputShell>
);

const LabeledColorInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <LabeledInputShell label={label}>
    <input type="color" className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2" value={value} onChange={(e) => onChange(e.target.value)} />
  </LabeledInputShell>
);

const KeyValue: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono = false }) => (
  <div className="space-y-1">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm ${mono ? 'font-mono break-all' : ''}`}>
      {value}
    </div>
  </div>
);

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
