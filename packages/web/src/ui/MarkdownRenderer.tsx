/** Renderiza markdown leve para mensagens da IA (sem dependência externa). */
export function renderMarkdown(text: string): string {
  let out = escapeHtml(text);

  out = out.replace(/((?:^\|.+\|\n)+)/gm, (block: string) => {
    const lines = block
      .trim()
      .split("\n")
      .filter((l) => l.includes("|"));
    if (lines.length < 2) return block;
    const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
    if (dataLines.length === 0) return block;
    const headerLine = dataLines[0] as string;
    const bodyLines = dataLines.slice(1);
    const cells = (l: string) =>
      l
        .split("|")
        .map((c) => c.trim())
        .filter((_c: string, i: number, arr: string[]) => i > 0 && i < arr.length - 1);
    const thead = `<tr>${cells(headerLine)
      .map((c) => `<th>${c}</th>`)
      .join("")}</tr>`;
    const tbody = bodyLines
      .map(
        (l) =>
          `<tr>${cells(l)
            .map((c) => `<td>${c}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    return `<table class="md-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  });

  out = out.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang: string, code: string) =>
      `<pre class="md-code-block"${lang ? ` data-lang="${lang}"` : ""}><code>${code.trimEnd()}</code></pre>`,
  );
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  out = out.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  out = out.replace(/^- (.+)$/gm, "<li>$1</li>");
  out = out.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');
  out = out.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  out = out.replace(/^---$/gm, '<hr class="md-hr"/>');
  out = out.replace(/\n\n/g, "<br/><br/>");
  out = out.replace(/\n/g, "<br/>");

  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
