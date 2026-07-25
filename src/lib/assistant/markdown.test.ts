import { describe, expect, it } from 'vitest';
import { escapeHtml, renderAssistantMarkdown } from './markdown.js';

describe('renderAssistantMarkdown', () => {
  it('escapes HTML before any formatting runs', () => {
    const html = renderAssistantMarkdown('<img src=x onerror=alert(1)> e **negrito**');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>negrito</strong>');
  });

  it('never emits a tag coming from the source text', () => {
    const html = renderAssistantMarkdown('**<script>alert(1)</script>**');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders bold, italic and inline code', () => {
    expect(renderAssistantMarkdown('use **isso** e *aquilo* com `código`')).toBe(
      '<p>use <strong>isso</strong> e <em>aquilo</em> com <code>código</code></p>'
    );
  });

  it('renders dashed lists', () => {
    expect(renderAssistantMarkdown('Hoje:\n- Revisar PR\n- Enviar nota')).toBe(
      '<p>Hoje:</p><ul><li>Revisar PR</li><li>Enviar nota</li></ul>'
    );
  });

  it('keeps single newlines as line breaks inside a paragraph', () => {
    expect(renderAssistantMarkdown('linha um\nlinha dois')).toBe('<p>linha um<br>linha dois</p>');
  });

  it('separates paragraphs on blank lines', () => {
    expect(renderAssistantMarkdown('um\n\ndois')).toBe('<p>um</p><p>dois</p>');
  });

  it('leaves standalone asterisks alone', () => {
    expect(renderAssistantMarkdown('2 * 3 = 6')).toBe('<p>2 * 3 = 6</p>');
  });

  it('returns an empty string for blank input', () => {
    expect(renderAssistantMarkdown('')).toBe('');
    expect(renderAssistantMarkdown('   \n  ')).toBe('');
  });

  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
