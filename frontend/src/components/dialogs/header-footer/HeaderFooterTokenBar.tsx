import React from 'react';

const TOKENS = [
  ['{{physicalPage}}', 'Physical page'],
  ['{{pageLabel}}', 'Logical label'],
  ['{{pageCount}}', 'Total pages'],
  ['{{sectionPage}}', 'Section page'],
  ['{{sectionPageCount}}', 'Section total'],
  ['{{fileName}}', 'File name'],
  ['{{date}}', 'Date'],
  ['{{time}}', 'Time'],
] as const;

interface HeaderFooterTokenBarProps {
  onInsert: (token: string) => void;
}

export const HeaderFooterTokenBar: React.FC<
  HeaderFooterTokenBarProps
> = ({ onInsert }) => (
  <div>
    <div className="mb-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
      Insert token into active slot
    </div>
    <div className="flex flex-wrap gap-1">
      {TOKENS.map(([token, label]) => (
        <button
          key={token}
          type="button"
          onClick={() => onInsert(token)}
          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
          title={token}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
);
