/*
 * AiCommandPreview component.
 *
 * Displays a simple overview of the commands proposed by an AI
 * generation plan.  It uses the diff preview helper to summarise
 * the number of changes.  In preview mode the confirm button is
 * disabled because commands are not executed.  A production
 * implementation would call a command dispatcher on confirm.
 */

import React from 'react';
import type { AiPlan } from '../../core/generate/types';
import { generateDiffPreview } from '../../core/generate/diffPreview';

export interface AiCommandPreviewProps {
  plan: AiPlan;
}

export default function AiCommandPreview({ plan }: AiCommandPreviewProps): JSX.Element {
  const diff = generateDiffPreview(plan.proposedCommands);
  return (
    <div className="doccraft-ai-command-preview">
      <p>{diff.summary}</p>
      {plan.proposedCommands.length > 0 && (
        <ul>
          {plan.proposedCommands.map((cmd) => (
            <li key={cmd.id}>{cmd.type}</li>
          ))}
        </ul>
      )}
      {/* The confirm button is disabled in preview mode.  */}
      <button disabled>Confirm (disabled in preview)</button>
    </div>
  );
}