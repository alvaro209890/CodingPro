import { useCallback, useEffect, useRef, useState } from "react";

const SITE_URL = "https://codingpro.cursar.space";

export type EstadoAcesso = {
  modo: "conta" | "chave-propria" | "sem-acesso";
  apiUrl?: string;
  prefixoToken?: string;
};

/**
 * Tela de entrada do app distribuído: sem conta e sem chave própria, o app não fala
 * com IA nenhuma. Usa o mesmo device flow da CLI, então o token cai no mesmo
 * `~/.codingpro/credenciais.json` — quem já rodou `codingpro login` nem vê esta tela.
 */
export function TelaConta({ aoConectar }: { aoConectar: () => void }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [url, setUrl] = useState(SITE_URL);
  const [erro, setErro] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const pararRef = useRef(false);

  useEffect(() => {
    return () => {
      pararRef.current = true;
    };
  }, []);

  const entrar = useCallback(async () => {
    setErro("");
    setAguardando(true);
    try {
      const inicio = await window.codingproAPI.contaLogin();
      setCodigo(inicio.codigoUsuario);
      setUrl(inicio.urlVerificacao);

      const limite = Date.now() + 10 * 60 * 1000;
      while (!pararRef.current && Date.now() < limite) {
        await new Promise((r) => setTimeout(r, (inicio.intervaloSegundos || 3) * 1000));
        const resultado = await window.codingproAPI.contaConsultar(
          inicio.apiUrl ?? "https://codingpro-api.cursar.space",
          inicio.codigoDispositivo,
        );
        if (resultado.estado === "pronto") {
          aoConectar();
          return;
        }
        if (resultado.estado === "expirado") {
          setErro("O código expirou. Tente entrar de novo.");
          setCodigo(null);
          return;
        }
      }
      setErro("Tempo esgotado esperando a confirmação.");
      setCodigo(null);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não consegui iniciar o login.");
    } finally {
      setAguardando(false);
    }
  }, [aoConectar]);

  return (
    <div className="tela-conta">
      <div className="tela-conta__cartao">
        <h1 className="tela-conta__marca">CodingPro</h1>
        <p className="tela-conta__sub">
          Entre com sua conta para usar o app — sem precisar de chave de IA própria.
        </p>

        {erro && <div className="tela-conta__erro">{erro}</div>}

        {codigo ? (
          <>
            <p className="tela-conta__instrucao">
              Abrimos <strong>{url}</strong> no seu navegador. Digite lá o código:
            </p>
            <div className="tela-conta__codigo">{codigo}</div>
            <p className="tela-conta__espera">Aguardando a confirmação no site…</p>
          </>
        ) : (
          <>
            <button
              className="tela-conta__botao"
              disabled={aguardando}
              onClick={entrar}
              type="button"
            >
              {aguardando ? "Abrindo…" : "Entrar com minha conta"}
            </button>
            <p className="tela-conta__rodape">
              Ainda não tem conta? Crie em <strong>{SITE_URL}</strong> — as contas são aprovadas
              pelo administrador antes de liberar o uso.
            </p>
            <p className="tela-conta__rodape">
              Prefere sua própria chave? Defina <code>DEEPSEEK_API_KEY</code> no ambiente e reinicie
              o app.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
