/*
 * OcrProgress component.
 *
 * This component displays a list of active OCR jobs and their
 * completion status.  It listens to the OcrStore and re-renders
 * whenever jobs are added or updated.  Completed jobs show the
 * number of pages processed, and running jobs display a basic
 * progress indicator.
 */

import React, { useEffect, useState } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import type { OcrJob } from '../../core/ocr/types';

export interface OcrProgressProps {
  ocrStore: OcrStore;
}

export default function OcrProgress({ ocrStore }: OcrProgressProps): JSX.Element {
  const [jobs, setJobs] = useState<OcrJob[]>(ocrStore.getJobs());

  useEffect(() => {
    // Subscribe to store updates and update state when jobs change.
    const unsubscribe = ocrStore.subscribe(() => {
      setJobs(ocrStore.getJobs());
    });
    return () => unsubscribe();
  }, [ocrStore]);

  return (
    <div className="doccraft-ocr-progress">
      {jobs.length === 0 && <p>No OCR jobs</p>}
      {jobs.map((job) => {
        const total = job.pageNumbers.length;
        const completeCount = job.results.length;
        const status = job.status;
        return (
          <div key={job.id} className={`ocr-job ocr-status-${status}`}>
            <strong>Job {job.id.slice(0, 5)}</strong> – {status}
            {status === 'running' && (
              <span>
                : {completeCount}/{total} pages complete
              </span>
            )}
            {status === 'complete' && (
              <span>
                : {total} pages
              </span>
            )}
            {(status === 'failed' || status === 'cancelled') && (
              <span> – cancelled or failed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}