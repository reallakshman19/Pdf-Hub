const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'style',
]);

const SAFE_STYLE_PROPS = new Set([
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'color',
  'background-color',
  'font-size',
  'font-family',
  'line-height',
  'border',
  'border-color',
  'border-width',
  'padding',
  'margin',
]);

export function sanitizeMacroHtml(html: string): string {
  if (!html) return '';

  if (typeof document === 'undefined') {
    return stripDangerousHtmlFallback(html);
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  for (const node of Array.from(template.content.querySelectorAll('*'))) {
    const tag = node.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tag)) {
      node.remove();
      continue;
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'href' || name === 'src') && !isSafeMacroUrl(value)) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        const safeStyle = sanitizeMacroStyle(value);
        if (safeStyle) node.setAttribute('style', safeStyle);
        else node.removeAttribute('style');
      }
    }
  }

  return template.innerHTML;
}

export function sanitizeMacroStyle(style: string): string {
  return String(style ?? '')
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [rawProp, ...rawValue] = rule.split(':');
      const prop = rawProp?.trim().toLowerCase();
      const value = rawValue.join(':').trim();

      if (!prop || !SAFE_STYLE_PROPS.has(prop)) return '';
      if (/url\s*\(/i.test(value)) return '';
      if (/expression\s*\(/i.test(value)) return '';
      if (/javascript:/i.test(value)) return '';
      if (/[<>"'`]/.test(value)) return '';

      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

export function escapeMacroHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function isSafeMacroImageSrc(src: string): boolean {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(src ?? '').trim());
}

export function isSafeMacroUrl(url: string): boolean {
  const value = String(url ?? '').trim();

  if (/^javascript:/i.test(value)) return false;
  if (/^data:text\/html/i.test(value)) return false;

  return (
    /^https?:\/\//i.test(value) ||
    /^#/.test(value) ||
    isSafeMacroImageSrc(value)
  );
}

export function safeMacroCssColor(value: unknown, fallback = '#111827'): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();

  if (/url\s*\(/i.test(trimmed)) return fallback;
  if (/expression\s*\(/i.test(trimmed)) return fallback;
  if (/javascript:/i.test(trimmed)) return fallback;
  if (/[<>"'`]/.test(trimmed)) return fallback;

  if (
    /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed) ||
    /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(trimmed) ||
    /^[a-zA-Z]+$/.test(trimmed) ||
    trimmed === 'transparent'
  ) {
    return trimmed;
  }

  return fallback;
}

export function safeMacroFontFamily(value: unknown): string {
  if (typeof value !== 'string') return 'Arial';

  const trimmed = value.trim();

  if (/url\s*\(/i.test(trimmed)) return 'Arial';
  if (/expression\s*\(/i.test(trimmed)) return 'Arial';
  if (/javascript:/i.test(trimmed)) return 'Arial';
  if (/[<>"'`;{}]/.test(trimmed)) return 'Arial';

  const safe = trimmed.replace(/[^a-zA-Z0-9 ,._-]/g, '').trim();

  return safe || 'Arial';
}

function stripDangerousHtmlFallback(html: string): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|link|meta|base|form|input|button|textarea|select|style)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|link|meta|base|form|input|button|textarea|select|style)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*data:text\/html[\s\S]*?\2/gi, '');
}
