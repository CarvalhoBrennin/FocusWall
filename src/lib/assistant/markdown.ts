/**
 * Minimal Markdown renderer for assistant replies.
 *
 * The model writes light Markdown (bold, inline code, dashed lists) that used to
 * reach the user as literal asterisks inside a <pre>. This covers only that
 * subset: the input is model output, so everything is HTML-escaped first and no
 * construct here can emit an attribute, a URL or a tag from the source text.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Inline formatting, applied to already-escaped text. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
}

function isListItem(line: string): boolean {
  return /^\s*[-*+]\s+\S/.test(line);
}

function listItemContent(line: string): string {
  return line.replace(/^\s*[-*+]\s+/, '');
}

export function renderAssistantMarkdown(text: string): string {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  if (!source.trim()) return '';

  const blocks: string[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    blocks.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listBuffer = [];
  };
  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push(`<p>${paragraphBuffer.join('<br>')}</p>`);
    paragraphBuffer = [];
  };

  for (const line of source.split('\n')) {
    if (!line.trim()) {
      flushList();
      flushParagraph();
      continue;
    }
    if (isListItem(line)) {
      flushParagraph();
      listBuffer.push(renderInline(escapeHtml(listItemContent(line))));
      continue;
    }
    flushList();
    paragraphBuffer.push(renderInline(escapeHtml(line)));
  }

  flushList();
  flushParagraph();
  return blocks.join('');
}
