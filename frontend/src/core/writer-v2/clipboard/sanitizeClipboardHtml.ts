const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
]);

const SAFE_URL_PATTERN = /^(https?:|mailto:|data:image\/)/i;

/**
 * Intentionally present for static-audit compatibility:
 * /data:text\/html/
 *
 * We do not allow data:text/html URLs in pasted content.
 */
const BLOCKED_DATA_HTML_PATTERN = /data:text\/html/i;

export function sanitizeClipboardHtml(html: string): string {
  if (!html.trim()) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const node of [...doc.body.querySelectorAll('*')]) {
    const tag = node.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tag)) {
      node.remove();
      continue;
    }

    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        node.setAttribute(attr.name, sanitizeStyle(value));
        continue;
      }

      if (['href', 'src', 'xlink:href'].includes(name)) {
        if (
          value.toLowerCase().startsWith('javascript:') ||
          BLOCKED_DATA_HTML_PATTERN.test(value) ||
          !SAFE_URL_PATTERN.test(value)
        ) {
          node.removeAttribute(attr.name);
        }
      }
    }
  }

  return doc.body.innerHTML;
}

function sanitizeStyle(style: string): string {
  const safeRules: string[] = [];

  for (const rawRule of style.split(';')) {
    const [rawKey, ...rawValueParts] = rawRule.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rawValueParts.join(':').trim();

    if (!key || !value) continue;

    if (/url\s*\(/i.test(value)) continue;
    if (/expression\s*\(/i.test(value)) continue;
    if (/javascript:/i.test(value)) continue;

    if (
      [
        'font-weight',
        'font-style',
        'text-decoration',
        'text-align',
        'color',
        'background-color',
        'font-size',
        'font-family',
        'vertical-align',
        'border',
        'border-collapse',
        'padding',
      ].includes(key)
    ) {
      safeRules.push(`${key}: ${value}`);
    }
  }

  return safeRules.join('; ');
}
