// src/core/annotation-core/workflow-facade.ts
// ⚠️ INVARIANT: All annotation workflows MUST conform to this interface (AD-10).
// ⚠️ INVARIANT: Platform layers must NEVER import from workflow packages (AD-05).

import type { PageScene } from './page-scene';
import type { AnnotationTarget } from './target';
import type { AnnotationContent } from './content';
import type { PlacementPolicy } from './placement-policy';
import type { GeneratedAnnotationIdentity } from './annotation-identity';

export interface AnnotationWorkflowConfig<TInput, TPlan, TOutput> {
  workflowId: string;
  version: string;
  defaultPlacementPolicy: PlacementPolicy;

  // Lifecycle steps
  extractTargets: (input: TInput, scene: PageScene) => Promise<AnnotationTarget[]>;
  planContent: (targets: AnnotationTarget[], scene: PageScene) => Promise<AnnotationContent[]>;
  solvePlacement: (content: AnnotationContent[], scene: PageScene, policy?: PlacementPolicy) => Promise<TPlan[]>;
  renderOutput: (plans: TPlan[], targetDocument: Uint8Array) => Promise<TOutput>;
  verifyOutput: (output: TOutput, plans: TPlan[], identity: GeneratedAnnotationIdentity[]) => Promise<boolean>;
}

export interface AnnotationWorkflowInstance<TInput, TPlan, TOutput> {
  workflowId: string;
  version: string;
  execute: (
    input: TInput,
    scene: PageScene,
    targetDocument: Uint8Array,
    options?: { placementPolicy?: PlacementPolicy; signal?: AbortSignal }
  ) => Promise<{
    output: TOutput;
    plans: TPlan[];
    verified: boolean;
  }>;
}

export function createAnnotationWorkflow<TInput, TPlan, TOutput>(
  config: AnnotationWorkflowConfig<TInput, TPlan, TOutput>
): AnnotationWorkflowInstance<TInput, TPlan, TOutput> {
  return {
    workflowId: config.workflowId,
    version: config.version,
    execute: async (input, scene, targetDocument, options) => {
      const signal = options?.signal;
      if (signal?.aborted) throw new Error(`Workflow ${config.workflowId} execution aborted before extraction.`);

      const policy = options?.placementPolicy ?? config.defaultPlacementPolicy;

      const targets = await config.extractTargets(input, scene);
      if (signal?.aborted) throw new Error(`Workflow ${config.workflowId} execution aborted after extraction.`);

      const contents = await config.planContent(targets, scene);
      if (signal?.aborted) throw new Error(`Workflow ${config.workflowId} execution aborted after planning.`);

      const plans = await config.solvePlacement(contents, scene, policy);
      if (signal?.aborted) throw new Error(`Workflow ${config.workflowId} execution aborted after placement solution.`);

      const output = await config.renderOutput(plans, targetDocument);
      if (signal?.aborted) throw new Error(`Workflow ${config.workflowId} execution aborted after rendering.`);

      const verified = await config.verifyOutput(output, plans, []);

      return {
        output,
        plans,
        verified,
      };
    },
  };
}
