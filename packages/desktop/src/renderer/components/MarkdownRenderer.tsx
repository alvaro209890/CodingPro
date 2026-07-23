/** Renderiza markdown para HTML — tabelas, code, bold, listas, itálico. */
export function renderMarkdown(text: string): string {
  let out = text;

  // Tabelas: | col1 | col2 | → <table>
  out = out.replace(
    /((?:^\|.+\|\n)+)/gm,
    (block: string) => {
      const lines = block.trim().split("\n").filter((l) => l.includes("|"));
      if (lines.length < 2) return block;
      // skip separator line like |---|---|
      const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
            if (dataLines.length === 0) return block;
            const headerLine = dataLines[0] as string;
            const bodyLines = dataLines.slice(1);
            const cells = (l: string) =>
              l
                .split("|")
                .map((c) => c.trim())
                .filter((c: string, i: number, arr: string[]) => i > 0 && i < arr.length - 1);
      const headerCells = cells(headerLine);
      const thead = `<tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
      const tbody = bodyLines
        .map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("");
      return `<table class="md-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    },
  );

  // code blocks ```
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>');
  // inline code `...`
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // bold **...**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic *...*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // headers ### 
  out = out.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  // list items - ...
  out = out.replace(/^- (.+)$/gm, '<li>$1</li>');
  out = out.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');
  // numbered
  out = out.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // horizontal rule
  out = out.replace(/^---$/gm, '<hr class="md-hr"/>');
  // line breaks
  out = out.replace(/\n\n/g, '<br/><br/>');
  out = out.replace(/\n/g, '<br/>');

  return out;
}
