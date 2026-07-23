/** Renderiza markdown simples para HTML — bold, code inline, code blocks, listas. */
export function renderMarkdown(text: string): string {
  let out = text;
  // code blocks ```
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>');
  // inline code `...`
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // bold **...**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic *...*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // list items - ...
  out = out.replace(/^- (.+)$/gm, '<li>$1</li>');
  // wrap consecutive <li>s in <ul>
  out = out.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');
  // numbered list
  out = out.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // preserve line breaks
  out = out.replace(/\n\n/g, '<br/><br/>');
  out = out.replace(/\n/g, '<br/>');
  return out;
}
