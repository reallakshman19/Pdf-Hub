/*
 * GeneratePanel component.
 *
 * This component provides a minimal user interface for the AI
 * generate mode.  Users can enter a prompt which will be passed to
 * the command planner.  The resulting plan is displayed along with
 * a summary of proposed commands.  In preview mode no commands are
 * actually executed; the user can inspect the plan without side
 * effects.
 */

import React, { useState } from 'react';
import { planCommands } from '../../core/generate/commandPlanner';
import type { AiPlan } from '../../core/generate/types';
import AiCommandPreview from './AiCommandPreview';

export default function GeneratePanel(): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AiPlan | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPlan = planCommands(prompt);
    setPlan(newPlan);
  };

  return (
    <div className="doccraft-generate-panel">
      <h3>Generate / AI</h3>
      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a request for AI assistance..."
          rows={3}
          style={{ width: '100%' }}
        />
        <button type="submit">Generate Plan</button>
      </form>
      {plan && (
        <div className="ai-plan-result">
          <h4>Plan Summary</h4>
          <p>{plan.explanation}</p>
          <AiCommandPreview plan={plan} />
        </div>
      )}
    </div>
  );
}