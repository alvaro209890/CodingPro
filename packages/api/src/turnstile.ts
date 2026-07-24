const URL_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile(
  token: string,
  secret: string,
  ip?: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean> {
  if (secret.trim() === "") return true;
  if (token.trim() === "") return false;

  const corpo = new URLSearchParams({
    response: token,
    secret,
  });
  if (ip !== undefined && ip !== "") corpo.set("remoteip", ip);

  try {
    const resposta = await fetchFn(URL_TURNSTILE, {
      body: corpo,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!resposta.ok) return false;
    const dados = (await resposta.json()) as { success?: boolean };
    return dados.success === true;
  } catch {
    return false;
  }
}
