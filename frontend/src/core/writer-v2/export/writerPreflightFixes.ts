import { fitRichBoxesToContentByIds } from '../writerRichBoxFitActions';
import type {
  WriterExportPreflightIssue,
  WriterExportPreflightResult,
} from './writerExportPreflight';

export function richContentClipIssueIds(
  issues: WriterExportPreflightIssue[],
): string[] {
  return [
    ...new Set(
      issues
        .filter((issue) => issue.code === 'RICH_CONTENT_MAY_CLIP')
        .map((issue) => issue.elementId)
        .filter(Boolean) as string[],
    ),
  ];
}

export function canFixRichContentClipIssues(
  result: WriterExportPreflightResult,
): boolean {
  return richContentClipIssueIds(result.issues).length > 0;
}

export async function fixRichContentClipIssues(
  result: WriterExportPreflightResult,
): Promise<{
  changed: boolean;
  fixedCount: number;
  message: string;
}> {
  const ids = richContentClipIssueIds(result.issues);

  if (ids.length === 0) {
    return {
      changed: false,
      fixedCount: 0,
      message: 'No clipped rich Writer boxes were found.',
    };
  }

  const fit = await fitRichBoxesToContentByIds(ids);

  return {
    changed: fit.changed,
    fixedCount: fit.fittedCount,
    message: fit.message,
  };
}
