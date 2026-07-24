import { type FormEvent, useState } from "react";
import { api, ErroApi, type Usuario } from "../api.js";
import { Aviso, Cartao } from "../componentes.js";
import { propsLink } from "../rotas.js";

/** Tela onde o usuário digita o código mostrado pelo `codingpro login`. */
export function EntrarDispositivo({ usuario }: { usuario: Usuario | null }) {
  const [codigo, setCodigo] = useState("");
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await api.post("/api/device/aprovar", { codigoUsuario: codigo.trim().toUpperCase() });
      setPronto(true);
    } catch (causa) {
      setErro(causa instanceof ErroApi ? causa.message : "Não consegui autorizar o dispositivo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!usuario) {
    return (
      <div className="estreito" style={{ margin: "2rem auto" }}>
        <Cartao>
          <h2>Conectar dispositivo</h2>
          <p>Entre na sua conta primeiro para autorizar a máquina que está pedindo acesso.</p>
          <a className="botao primario" {...propsLink("/entrar?voltar=/entrar-dispositivo")}>
            Entrar
          </a>
        </Cartao>
      </div>
    );
  }

  return (
    <div className="estreito" style={{ margin: "2rem auto" }}>
      <Cartao>
        <h2>Conectar dispositivo</h2>
        {pronto ? (
          <Aviso tipo="sucesso">
            <strong>Dispositivo autorizado.</strong> Volte ao terminal — a CLI já deve ter concluído
            o login sozinha.
          </Aviso>
        ) : (
          <>
            <p>
              Digite aqui o código que o <code>codingpro login</code> mostrou no seu terminal.
            </p>
            {usuario.status !== "ativo" && (
              <Aviso tipo="atencao">
                Sua conta ainda não foi aprovada, então a autorização vai ser recusada por enquanto.
              </Aviso>
            )}
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <form onSubmit={enviar}>
              <input
                aria-label="Código do dispositivo"
                autoCapitalize="characters"
                className="codigo-grande mono"
                maxLength={9}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                required
                value={codigo}
              />
              <button
                className="primario"
                disabled={enviando}
                style={{ marginTop: "1rem", width: "100%" }}
                type="submit"
              >
                {enviando ? "Autorizando…" : "Autorizar dispositivo"}
              </button>
            </form>
          </>
        )}
      </Cartao>
    </div>
  );
}
