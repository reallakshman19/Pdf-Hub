import type { PageId } from '@/core/pages/types';

export type ExistingTextDeleteStrategy =
  | 'auto'
  | 'native-excision'
  | 'visual-inpaint';

export interface ExistingTextDeleteIntent {
  readonly schemaVersion: 1;
  readonly sourceRevisionId: string;
  readonly pageId: PageId;
  readonly pageIndex: number;
  readonly spanId: string;
  readonly sourceIndex: number;
  readonly expectedText: string;
  readonly strategy: ExistingTextDeleteStrategy;
}

export interface ExistingTextDeletionResult {
  readonly success: boolean;
  readonly strategyApplied: 'native-excision' | 'visual-inpaint';
  readonly spanId: string;
  readonly pageIndex: number;
  readonly originalText: string;
  readonly bytesModified: boolean;
  readonly visualClearanceProved: boolean;
  readonly details: {
    readonly streamIndex?: number;
    readonly operatorIndex?: number;
    readonly whiteoutEmitted?: boolean;
    readonly rotationDegrees?: number;
  };
}
