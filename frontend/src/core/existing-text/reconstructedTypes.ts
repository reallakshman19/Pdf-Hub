import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from './types';
import type {
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';
import type {
  ExistingTextReconstructedOverlayEvidence,
  ExistingTextNativeFitDiagnostic,
} from './fitTypes';
import type {
  ExistingTextVisualClearanceProof,
} from './visualClearanceTypes';

export interface ExistingTextReconstructedReplacementMutationInput {
  currentRevisionId: string;
  span: ExistingTextSpan;
  intent: ExistingTextEditIntent;
  provenance:
    ExistingTextSimpleTextOperator;
  signal?: AbortSignal;
}

export interface ExistingTextReconstructedReplacementMutationResult {
  pageIndex: number;
  originalText: string;
  replacementText: string;
  fontResourceName: string;
  baseFont: string;
  nativeFit:
    ExistingTextNativeFitDiagnostic
    & { status: 'overflows' };
  evidence:
    ExistingTextReconstructedOverlayEvidence;
  proof:
    ExistingTextVisualClearanceProof;
}
