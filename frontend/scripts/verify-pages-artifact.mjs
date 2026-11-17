import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const [distArg = 'dist', base = '/Pdf-Hub/'] = process.argv.slice(2);
const dist = resolve(distArg);
if (!base.startsWith('/') || !base.endsWith('/')) {
  throw new Error('Pages base must be an absolute path with a trailing slash');
}
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
if (!/<div\b[^>]*\bid=["']root["']/i.test(html)) {
  throw new Error('Production index is missing the React root');
}
const urls = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1]);
if (!scripts.some((url) => url.startsWith(base + 'assets/') && /\.m?js$/.test(url))) {
  throw new Error('Production index does not reference a compiled Vite entry script');
}
for (const url of urls) {
  if (/^(?:https?:|data:|#)/i.test(url)) continue;
  if (!url.startsWith(base) || /(?:^|\/)src\/|\.tsx?(?:$|[?#])/i.test(url)) {
    throw new Error('Invalid production asset reference: ' + url);
  }
  const local = resolve(dist, decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]));
  const rel = relative(dist, local);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || !statSync(local).isFile()) {
    throw new Error('Missing or unsafe production asset: ' + url);
  }
}
console.log('Verified compiled Pages index and ' + urls.length + ' asset references for ' + base);
