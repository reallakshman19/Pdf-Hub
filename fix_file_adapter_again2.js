const fs = require('fs');

let file = 'frontend/src/adapters/file/FileAdapter.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const digest = await crypto.subtle.digest('SHA-256', bytes as any);",
  "const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));"
);

fs.writeFileSync(file, code);
