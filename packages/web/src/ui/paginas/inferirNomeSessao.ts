/** Nome gerado automaticamente ao criar sessão (`chat-01`, `chat-02`, …). */
export function ehNomePadrao(nome: string): boolean {
  return /^chat-\d{2}$/i.test(nome.trim());
}

function limparTexto(bruto: string): string {
  return bruto
    .replace(/^\/\w+(?:\s+|$)/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Título imediato a partir da primeira mensagem (sem rede). */
export function inferirNomeSessao(pergunta: string, resposta = ""): string {
  const usuario = limparTexto(pergunta);
  const assistente = limparTexto(resposta);

  const base = usuario || assistente;
  if (!base) return "Nova conversa";

  const frase = base.split(/[.!?\n]/)[0]?.trim() || base;
  const palavras = frase.split(/\s+/).filter(Boolean);

  // Remove imperativos comuns no início
  const skip = new Set([
    "crie",
    "criar",
    "faça",
    "fazer",
    "me",
    "ajude",
    "ajuda",
    "preciso",
    "quero",
    "como",
    "por",
    "favor",
    "explique",
    "analise",
    "analisa",
    "implemente",
    "implementar",
  ]);
  while (palavras.length > 3 && skip.has(palavras[0]?.toLowerCase() ?? "")) {
    palavras.shift();
  }

  let titulo = palavras.slice(0, 7).join(" ");
  if (titulo.length > 42) titulo = `${titulo.slice(0, 39)}…`;
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  return titulo.slice(0, 40) || "Nova conversa";
}

/** Refina o título via IA (uma chamada curta após a 1ª resposta). */
export async function refinarNomeSessaoViaApi(
  post: <T>(path: string, body?: unknown) => Promise<T>,
  pergunta: string,
  resposta: string,
): Promise<string | null> {
  try {
    const dados = await post<{ reply?: string }>("/api/vps/chat", {
      prompt: [
        "Gere APENAS um título curto (3 a 6 palavras, português, sem aspas nem pontuação final)",
        "para esta conversa de programação. Não explique, responda só o título.",
        "",
        `Usuário: ${limparTexto(pergunta).slice(0, 280)}`,
        `Assistente: ${limparTexto(resposta).slice(0, 280)}`,
      ].join("\n"),
    });
    const bruto = dados.reply?.trim().replace(/^["'“”]+|["'“”]+$/g, "") ?? "";
    if (!bruto || bruto.length < 3) return null;
    return bruto.length > 40 ? `${bruto.slice(0, 37)}…` : bruto;
  } catch {
    return null;
  }
}
