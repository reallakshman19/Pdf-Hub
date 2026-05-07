/**
 * htmlSanitizer.ts
 *
 * Provides a native DOMParser-based HTML sanitizer.
 * It is designed to strip <script>, <iframe>, and other unsafe tags
 * from pasted HTML (e.g. from Word or the browser) while preserving
 * basic layout and typography elements like <b>, <i>, <ul>, <table>, etc.
 */

const ALLOWED_TAGS = new Set([
  'A', 'B', 'I', 'U', 'S', 'STRIKE', 'STRONG', 'EM',
  'P', 'DIV', 'SPAN', 'BR', 'HR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'BLOCKQUOTE', 'PRE', 'CODE', 'IMG'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'href', 'src', 'alt', 'title', 'class', 'style',
  'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'width', 'height'
]);

export function sanitizeHtml(html: string): string {
  // Use native browser DOMParser to safely parse the incoming HTML string.
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Recursively walk and clean the DOM tree.
  cleanNode(doc.body);

  // Return the sanitized HTML string.
  return doc.body.innerHTML;
}

function cleanNode(node: Node) {
  // Process child nodes first (walking backward to allow safe removal).
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const child = node.childNodes[i];

    if (child.nodeType === Node.TEXT_NODE) {
      // Text nodes are generally safe.
      continue;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toUpperCase();

      // If the tag is explicitly allowed, clean its attributes and children.
      if (ALLOWED_TAGS.has(tag)) {
        cleanAttributes(el);
        cleanNode(el);
      } else {
        // If the tag is NOT allowed, try to preserve its textual content by replacing
        // the element with its children (unwrap it).
        // For inherently unsafe/invisible tags (like script, style, meta), we drop it entirely.
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK' || tag === 'IFRAME' || tag === 'OBJECT') {
          node.removeChild(child);
        } else {
          // Unwrap: move children out and delete the wrapper.
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el);
          }
          node.removeChild(el);
        }
      }
    } else {
      // Remove comments, CDATA, processing instructions, etc.
      node.removeChild(child);
    }
  }
}

function cleanAttributes(el: HTMLElement) {
  const attrs = el.attributes;
  // Iterate backward since we may remove attributes.
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    const attrName = attr.name.toLowerCase();

    // Remove explicitly disallowed attributes or "on*" event handlers.
    if (!ALLOWED_ATTRIBUTES.has(attrName) || attrName.startsWith('on')) {
      el.removeAttribute(attrName);
    } else if (attrName === 'href' || attrName === 'src') {
      // Basic safeguard against javascript: URIs.
      const val = attr.value.toLowerCase().trim();
      if (val.startsWith('javascript:') || val.startsWith('vbscript:') || val.startsWith('data:text/html')) {
        el.removeAttribute(attrName);
      }
    }
  }
}
