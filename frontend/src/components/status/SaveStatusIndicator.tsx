import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Save, WifiOff } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSessionStore } from '@/core/session/store';
import { useWriterStore } from '@/core/writer/store';
import { useAnnotationStore } from '@/core/annotations/store';

export const SaveStatusIndicator: React.FC = () => {
  const {
    isDirty,
    isDocumentDirty,
    isReviewDirty,
    isSessionDirty,
    saveState,
    annotationAutosaveState,
    fileName,
  } = useSessionStore();

  const writerElementCount = useWriterStore((state) => state.elements.length);
  const annotationCount = useAnnotationStore((state) => state.annotations.length);

  const status = resolveStatus({
    isDirty,
    isDocumentDirty,
    isReviewDirty,
    isSessionDirty,
    saveStatus: saveState.status,
    annotationAutosaveStatus: annotationAutosaveState.status,
    writerElementCount,
    annotationCount,
  });

  const Icon = status.icon;

  return (
    <Tooltip content={status.tooltip}>
      <div
        className={[
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          status.className,
        ].join(' ')}
        aria-label={status.tooltip}
      >
        <Icon className={status.spin ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        <span className="hidden md:inline">{status.label}</span>
        {fileName && (
          <span className="hidden xl:inline max-w-[180px] truncate opacity-70">
            {fileName}
          </span>
        )}
      </div>
    </Tooltip>
  );
};

function resolveStatus(input: {
  isDirty: boolean;
  isDocumentDirty: boolean;
  isReviewDirty: boolean;
  isSessionDirty: boolean;
  saveStatus: string;
  annotationAutosaveStatus: string;
  writerElementCount: number;
  annotationCount: number;
}) {
  if (input.saveStatus === 'saving') {
    return {
      label: 'Saving…',
      tooltip: 'Saving document bytes, annotations, and writer elements.',
      icon: Loader2,
      spin: true,
      className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    };
  }

  if (input.saveStatus === 'exporting') {
    return {
      label: 'Exporting…',
      tooltip: 'Building an exported PDF. The current session will remain editable.',
      icon: Loader2,
      spin: true,
      className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    };
  }

  if (input.saveStatus === 'failed') {
    return {
      label: 'Save failed',
      tooltip: 'The last save/export failed. Your in-session changes are still present.',
      icon: AlertCircle,
      spin: false,
      className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    };
  }

  if (input.annotationAutosaveStatus === 'failed') {
    return {
      label: 'Autosave failed',
      tooltip:
        'Local annotation autosave failed. Save/export the PDF or retry after checking browser storage permissions.',
      icon: WifiOff,
      spin: false,
      className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    };
  }

  if (input.annotationAutosaveStatus === 'saving') {
    return {
      label: 'Autosaving…',
      tooltip: 'Saving annotation overlay state to local browser storage.',
      icon: Loader2,
      spin: true,
      className: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    };
  }

  if (input.isDirty) {
    const details: string[] = [];
    if (input.isDocumentDirty) details.push('document bytes changed');
    if (input.isReviewDirty || input.annotationCount > 0) {
      details.push(`${input.annotationCount} annotation${input.annotationCount === 1 ? '' : 's'}`);
    }
    if (input.isSessionDirty || input.writerElementCount > 0) {
      details.push(`${input.writerElementCount} writer element${input.writerElementCount === 1 ? '' : 's'}`);
    }

    return {
      label: 'Unsaved',
      tooltip: details.length > 0 ? `Unsaved changes: ${details.join(', ')}.` : 'There are unsaved changes.',
      icon: Clock,
      spin: false,
      className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    };
  }

  if (input.saveStatus === 'saved' || input.annotationAutosaveStatus === 'saved') {
    return {
      label: 'Saved',
      tooltip: 'Current document state is saved.',
      icon: CheckCircle2,
      spin: false,
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    };
  }

  return {
    label: 'Ready',
    tooltip: 'No active save operation.',
    icon: Save,
    spin: false,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
}
