/**
 * Updates text nodes in an existing PDF rich-text XHTML value without
 * discarding its paragraphs, spans, or style attributes. The text field in
 * the editor represents the concatenated text nodes, as on the owner corpus.
 * Rich text outside that representable subset must be left untouched.
 */
export function editNativeRichText(
  xml: string,
  originalText: string,
  nextText: string,
): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Cannot safely edit native rich text: invalid XHTML.');
  }
  const body = document.documentElement.localName === 'body'
    ? document.documentElement
    : document.getElementsByTagNameNS('*', 'body')[0];
  if (!body) throw new Error('Cannot safely edit native rich text: missing body.');

  const nodes: Array<{ node: Text | Element; value: string; lineBreak: boolean }> = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push({ node: node as Text, value: (node as Text).data, lineBreak: false });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      throw new Error('Cannot safely edit native rich text: unsupported content.');
    }
    const element = node as Element;
    if (element.localName === 'br') {
      if (element.childNodes.length) throw new Error('Cannot safely edit native rich text: invalid line break.');
      nodes.push({ node: element, value: '\n', lineBreak: true });
      return;
    }
    if (!['body', 'p', 'span'].includes(element.localName)) {
      throw new Error('Cannot safely edit native rich text: unsupported structure.');
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(body);
  if (nodes.map((item) => item.value).join('') !== originalText) {
    throw new Error('Cannot safely edit native rich text: the rich and plain text differ.');
  }
  if (originalText === nextText) return xml;
  if (nextText.includes('\r')) throw new Error('Cannot safely edit native rich text: unsupported line ending.');

  // Compare code points so an inserted/replaced character cannot split a
  // surrogate pair. Node offsets are then converted back to UTF-16 indices.
  const before = Array.from(originalText);
  const after = Array.from(nextText);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix += 1;
  const prefixOffset = before.slice(0, prefix).join('').length;
  const oldEnd = before.slice(0, before.length - suffix).join('').length;
  const replacement = after.slice(prefix, after.length - suffix).join('');

  const insertText = (node: Text, left: string, insertedText: string, right: string): void => {
    const parts = insertedText.split('\n');
    node.data = left + parts[0];
    let previous: Node = node;
    for (const part of parts.slice(1)) {
      const lineBreak = document.createElementNS(body.namespaceURI, 'br');
      const text = document.createTextNode(part);
      previous.parentNode!.insertBefore(lineBreak, previous.nextSibling);
      lineBreak.parentNode!.insertBefore(text, lineBreak.nextSibling);
      previous = text;
    }
    (previous as Text).data += right;
  };

  if (nodes.length === 0) {
    const paragraph = body.getElementsByTagNameNS('*', 'p')[0] ?? body;
    const node = document.createTextNode('');
    paragraph.appendChild(node);
    insertText(node, '', replacement, '');
  } else {
    let offset = 0;
    let inserted = false;
    for (const item of nodes) {
      const { node, value } = item;
      const end = offset + value.length;
      if (item.lineBreak) {
        if (!inserted && prefixOffset >= offset && prefixOffset <= end) {
          const insertion = document.createTextNode('');
          node.parentNode!.insertBefore(insertion, prefixOffset === offset ? node : node.nextSibling);
          insertText(insertion, '', replacement, '');
          inserted = true;
        }
        if (offset < oldEnd && end > prefixOffset) node.parentNode!.removeChild(node);
        offset = end;
        continue;
      }
      const keepLeft = Math.max(0, Math.min(value.length, prefixOffset - offset));
      const keepRightFrom = Math.max(0, Math.min(value.length, oldEnd - offset));
      const insertHere = !inserted && prefixOffset >= offset && prefixOffset <= end;
      if (insertHere) {
        insertText(node as Text, value.slice(0, keepLeft), replacement, value.slice(keepRightFrom));
        inserted = true;
      } else {
        (node as Text).data = value.slice(0, keepLeft) + value.slice(keepRightFrom);
      }
      offset = end;
    }
    if (!inserted) throw new Error('Cannot safely edit native rich text: insertion location is unavailable.');
  }
  const readEdited = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'br') return '\n';
    return Array.from(node.childNodes).map(readEdited).join('');
  };
  if (readEdited(body) !== nextText) {
    throw new Error('Cannot safely edit native rich text: the edited content did not round-trip.');
  }
  return new XMLSerializer().serializeToString(document);
}
