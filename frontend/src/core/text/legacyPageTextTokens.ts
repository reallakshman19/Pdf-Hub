export interface LegacyPageTextTokenValues {
  page: number;
  pages: number;
  file: string;
  date: string;
  enablePageNumberToken: boolean;
  enableFileNameToken: boolean;
  enableDateToken: boolean;
}

export function resolveLegacyPageTextTokens(
  template: string,
  values: LegacyPageTextTokenValues,
): string {
  let output = template;

  if (values.enablePageNumberToken) {
    output = output.replaceAll(
      '{page}',
      String(values.page),
    );
    output = output.replaceAll(
      '{{page}}',
      String(values.page),
    );
    output = output.replaceAll(
      '{pages}',
      String(values.pages),
    );
    output = output.replaceAll(
      '{{total_pages}}',
      String(values.pages),
    );
    output = output.replaceAll(
      '{{pages}}',
      String(values.pages),
    );
  }

  if (values.enableFileNameToken) {
    output = output.replaceAll(
      '{file}',
      values.file,
    );
    output = output.replaceAll(
      '{{file_name}}',
      values.file,
    );
    output = output.replaceAll(
      '{{file}}',
      values.file,
    );
  }

  if (values.enableDateToken) {
    output = output.replaceAll(
      '{date}',
      values.date,
    );
    output = output.replaceAll(
      '{{date}}',
      values.date,
    );
  }

  return output;
}
