export const escapeClipboardHtml = (html: string) => html;
export const sanitizeClipboardHtml = (html: string) => {
  if (html.includes('data:text/html') || html.includes('javascript:')) return '';
  return html;
}
