import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import type { OcrJob } from '../../core/ocr/types';

export interface OcrProgressProps {
  ocrStore: OcrStore;
}

export default function OcrProgress({ ocrStore }: OcrProgressProps): JSX.Element {
  const [jobs, setJobs] = useState<OcrJob[]>(ocrStore.getJobs());

  useEffect(() => {
    const unsubscribe = ocrStore.subscribe(() => {
      setJobs(ocrStore.getJobs());
    });

    return () => unsubscribe();
  }, [ocrStore]);

  return (
    <div
      className="doccraft-ocr-progress"
      data-testid="legacy-ocr-progress"
    >
      {jobs.length === 0 ? (
        <p>No legacy OCR jobs</p>
      ) : null}

      {jobs.map((job) => {
        const total = job.pageNumbers.length;
        const completeCount = job.results.length;
        const status = job.status;

        return (
          <div
            key={job.id}
            className={`ocr-job ocr-status-${status}`}
            data-testid="legacy-ocr-job-row"
          >
            <strong>Legacy job {job.id.slice(0, 5)}</strong> – {status}

            {status === 'running' ? (
              <span>
                : {completeCount}/{total} pages complete
              </span>
            ) : null}

            {status === 'complete' ? (
              <span>
                : {total} pages
              </span>
            ) : null}

            {(status === 'failed' || status === 'cancelled' || status === 'timeout') ? (
              <span> – retired/cancelled/failed</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}