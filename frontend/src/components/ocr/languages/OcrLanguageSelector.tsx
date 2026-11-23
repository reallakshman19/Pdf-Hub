import React from 'react';
import { Globe, Check, HardDriveDownload } from 'lucide-react';
import {
  SUPPORTED_OCR_LANGUAGES,
  buildMultiLanguageHints,
  getCachedLanguageCodes,
} from '@/core/ocr/languages/ocrLanguageManager';

export interface OcrLanguageSelectorProps {
  languageHints: string[];
  onChange: (languages: string[]) => void;
  disabled?: boolean;
}

export const OcrLanguageSelector: React.FC<OcrLanguageSelectorProps> = ({
  languageHints,
  onChange,
  disabled = false,
}) => {
  const [cachedCodes, setCachedCodes] = React.useState<string[]>([]);
  const primaryCode = languageHints[0] || 'eng';
  const secondaryCodes = React.useMemo(() => languageHints.slice(1), [languageHints]);

  React.useEffect(() => {
    let isMounted = true;
    void getCachedLanguageCodes().then((codes) => {
      if (!isMounted) return;
      setCachedCodes((prev) => {
        if (prev.length === codes.length && prev.every((c, i) => c === codes[i])) {
          return prev;
        }
        return codes;
      });
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePrimaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPrimary = e.target.value;
    onChange(buildMultiLanguageHints(newPrimary, secondaryCodes));
  };

  const toggleSecondaryLanguage = (code: string) => {
    if (code === primaryCode) return;

    const exists = secondaryCodes.includes(code);
    const nextSecondaries = exists
      ? secondaryCodes.filter((c) => c !== code)
      : [...secondaryCodes, code];

    onChange(buildMultiLanguageHints(primaryCode, nextSecondaries));
  };

  return (
    <div className="space-y-2 text-xs" data-testid="ocr-language-selector">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
          <Globe className="h-3.5 w-3.5 text-sky-500" />
          <span>Primary OCR Language</span>
        </label>
        <span className="text-[10px] text-slate-500">
          {languageHints.join(' + ').toUpperCase()}
        </span>
      </div>

      <select
        value={primaryCode}
        onChange={handlePrimaryChange}
        disabled={disabled}
        data-testid="ocr-primary-language-select"
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {SUPPORTED_OCR_LANGUAGES.map((lang) => {
          const isCached = cachedCodes.includes(lang.code);
          return (
            <option key={lang.code} value={lang.code}>
              {lang.name} ({lang.nativeName}) {isCached ? '• Cached' : ''}
            </option>
          );
        })}
      </select>

      {/* Multilingual additive chips */}
      <div className="pt-1">
        <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
          Combine with Secondary Languages:
        </span>
        <div className="flex flex-wrap gap-1.5" data-testid="ocr-secondary-language-chips">
          {SUPPORTED_OCR_LANGUAGES.filter((lang) => lang.code !== primaryCode).map((lang) => {
            const isSelected = secondaryCodes.includes(lang.code);
            const isCached = cachedCodes.includes(lang.code);

            return (
              <button
                key={lang.code}
                type="button"
                disabled={disabled}
                onClick={() => toggleSecondaryLanguage(lang.code)}
                data-testid={`ocr-lang-chip-${lang.code}`}
                data-selected={isSelected ? 'true' : 'false'}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
                {isCached && !isSelected && (
                  <HardDriveDownload className="h-2.5 w-2.5 text-emerald-500" title="Cached locally" />
                )}
                <span>{lang.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
