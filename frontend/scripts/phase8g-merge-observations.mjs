import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args =
  process.argv.slice(2);
const inputs =
  args
    .filter(
      (arg) =>
        arg.startsWith('--input='),
    )
    .map(
      (arg) =>
        path.resolve(
          root,
          arg.slice('--input='.length),
        ),
    );
const outputArg =
  args.find(
    (arg) =>
      arg.startsWith('--out='),
  );

if (
  inputs.length === 0
  || !outputArg
) {
  throw new Error(
    'Usage: phase8g-merge-observations.mjs --input=<file> [--input=<file>...] --out=<file>',
  );
}

const documents =
  inputs.map(
    (input) => ({
      input,
      document:
        JSON.parse(
          fs.readFileSync(
            input,
            'utf8',
          ),
        ),
    }),
  );

for (
  const { input, document }
  of documents
) {
  if (
    document.schema_version
    !== 'phase8g-benchmark-observation-v1'
  ) {
    throw new Error(
      input
      + ' has an invalid Phase 8G observation schema.',
    );
  }
  if (
    !Array.isArray(
      document.measurements,
    )
  ) {
    throw new Error(
      input
      + ' has no measurements array.',
    );
  }
}

const environment =
  documents[0].document
    .environment;
const environmentKey =
  JSON.stringify(environment);

for (
  const { input, document }
  of documents.slice(1)
) {
  if (
    JSON.stringify(
      document.environment,
    )
    !== environmentKey
  ) {
    throw new Error(
      input
      + ' environment does not match the first observation fragment.',
    );
  }
}

const output =
  path.resolve(
    root,
    outputArg.slice('--out='.length),
  );
fs.mkdirSync(
  path.dirname(output),
  {
    recursive: true,
  },
);
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      schema_version:
        'phase8g-benchmark-observation-v1',
      environment,
      measurements:
        documents.flatMap(
          ({ document }) =>
            document.measurements,
        ),
      fragments:
        documents.map(
          ({ input }) =>
            path.basename(input),
        ),
    },
    null,
    2,
  ) + '\n',
);

console.log(
  '[phase8g-merge] merged '
  + documents.length
  + ' observation fragments into '
  + output,
);
