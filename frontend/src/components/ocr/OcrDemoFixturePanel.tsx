import React from 'react';
import {
  FlaskConical,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  createOcrDemoFixture,
  listOcrDemoFixtureDescriptors,
  type OcrDemoFixture,
  type OcrDemoFixtureId,
} from '@/core/ocr/fixtures/ocrDemoFixtures';

export interface OcrDemoFixturePanelProps {
  disabled?: boolean;
  onFixtureLoaded?: (fixture: OcrDemoFixture) => void;
}

export const OcrDemoFixturePanel: React.FC<OcrDemoFixturePanelProps> = ({
  disabled = false,
  onFixtureLoaded,
}) => {
  const descriptors = React.useMemo(() => listOcrDemoFixtureDescriptors(), []);
  const [fixtureId, setFixtureId] = React.useState<OcrDemoFixtureId>('clean-text');
  const [isLoading, setIsLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadFixture = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const fixture = await createOcrDemoFixture(fixtureId);
      onFixtureLoaded?.(fixture);
      setMessage(`Loaded ${fixture.descriptor.title}: ${fixture.ocrResult.pages.length} page(s).`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load OCR demo fixture.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selected = descriptors.find((descriptor) => descriptor.id === fixtureId)
    ?? descriptors[0];

  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-demo-fixture-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-blue-600" />
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            OCR Demo Fixtures
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Load controlled OCR data for QA without uploading a PDF.
          </p>
        </div>
      </div>

      <label className="text-xs text-slate-600 dark:text-slate-300">
        Fixture
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={fixtureId}
          disabled={disabled || isLoading}
          data-testid="ocr-demo-fixture-select"
          onChange={(event) =>
            setFixtureId(event.currentTarget.value as OcrDemoFixtureId)
          }
        >
          {descriptors.map((descriptor) => (
            <option
              key={descriptor.id}
              value={descriptor.id}
            >
              {descriptor.title}
            </option>
          ))}
        </select>
      </label>

      <div
        className="mt-2 rounded bg-slate-50 px-2 py-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300"
        data-testid="ocr-demo-fixture-description"
      >
        <div className="font-medium text-slate-800 dark:text-slate-100">
          {selected.title}
        </div>
        <div className="mt-0.5">
          {selected.description}
        </div>
        <div className="mt-1 text-slate-500">
          Pages: {selected.pageCount}
          {' · '}
          Table: {selected.hasTable ? 'yes' : 'no'}
          {' · '}
          Writer candidate: {selected.hasWriterCandidate ? 'yes' : 'no'}
        </div>
      </div>

      {message ? (
        <p
          className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          data-testid="ocr-demo-fixture-message"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          disabled={disabled || isLoading}
          onClick={loadFixture}
          data-testid="ocr-demo-fixture-load"
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          {isLoading ? 'Loading' : 'Load demo fixture'}
        </Button>
      </div>
    </div>
  );
};
