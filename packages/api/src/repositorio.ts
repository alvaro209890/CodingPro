import type { Sql } from "./db/index.js";

export type StatusUsuario = "pendente" | "ativo" | "bloqueado";

export type Usuario = {
  readonly id: number;
  readonly email: string;
  readonly senha_hash: string;
  readonly nome: string;
  readonly status: StatusUsuario;
  readonly admin: boolean;
  readonly email_verificado: boolean;
  readonly codigo_verificacao: string | null;
  readonly limite_mensal_micro: number;
  readonly criado_em: Date;
  readonly ultimo_login: Date | null;
};

export type TokenCli = {
  readonly id: number;
  readonly usuario_id: number;
  readonly nome: string;
  readonly prefixo: string;
  readonly criado_em: Date;
  readonly ultimo_uso: Date | null;
  readonly revogado_em: Date | null;
};

export type ConsumoMes = {
  readonly custoMicro: number;
  readonly requisicoes: number;
  readonly limiteMicro: number;
};

/** Competência no formato `YYYY-MM`, em horário local do servidor. */
export function competenciaAtual(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

export function criarRepositorio(sql: Sql) {
  return {
    async criarUsuario(dados: {
      email: string;
      senhaHash: string;
      nome: string;
      admin: boolean;
      limiteMicro: number;
      codigoVerificacao: string;
    }): Promise<Usuario> {
      const [usuario] = await sql<Usuario[]>`
        INSERT INTO usuarios (email, senha_hash, nome, admin, limite_mensal_micro,
                              codigo_verificacao, status)
        VALUES (${dados.email}, ${dados.senhaHash}, ${dados.nome}, ${dados.admin},
                ${dados.limiteMicro}, ${dados.codigoVerificacao},
                ${dados.admin ? "ativo" : "pendente"})
        RETURNING *
      `;
      if (!usuario) throw new Error("Falha ao criar usuário.");
      return usuario;
    },

    async buscarPorEmail(email: string): Promise<Usuario | null> {
      const [usuario] = await sql<Usuario[]>`SELECT * FROM usuarios WHERE email = ${email}`;
      return usuario ?? null;
    },

    async buscarPorId(id: number): Promise<Usuario | null> {
      const [usuario] = await sql<Usuario[]>`SELECT * FROM usuarios WHERE id = ${id}`;
      return usuario ?? null;
    },

    async contarUsuarios(): Promise<number> {
      const [linha] = await sql<
        { total: number }[]
      >`SELECT count(*)::bigint AS total FROM usuarios`;
      return Number(linha?.total ?? 0);
    },

    async marcarEmailVerificado(id: number): Promise<void> {
      await sql`
        UPDATE usuarios SET email_verificado = true, codigo_verificacao = NULL WHERE id = ${id}
      `;
    },

    async registrarLogin(id: number): Promise<void> {
      await sql`UPDATE usuarios SET ultimo_login = now() WHERE id = ${id}`;
    },

    async trocarSenha(id: number, senhaHash: string): Promise<void> {
      await sql`UPDATE usuarios SET senha_hash = ${senhaHash} WHERE id = ${id}`;
    },

    async listarUsuarios(busca: string): Promise<readonly Usuario[]> {
      const like = `%${busca.trim().toLowerCase()}%`;
      return await sql<Usuario[]>`
        SELECT * FROM usuarios
        WHERE ${busca.trim() === ""} OR lower(email) LIKE ${like} OR lower(nome) LIKE ${like}
        ORDER BY criado_em DESC
        LIMIT 500
      `;
    },

    async atualizarUsuario(
      id: number,
      campos: { status?: StatusUsuario; limiteMicro?: number; admin?: boolean },
    ): Promise<Usuario | null> {
      const [usuario] = await sql<Usuario[]>`
        UPDATE usuarios SET
          status              = COALESCE(${campos.status ?? null}, status),
          limite_mensal_micro = COALESCE(${campos.limiteMicro ?? null}, limite_mensal_micro),
          admin               = COALESCE(${campos.admin ?? null}, admin)
        WHERE id = ${id}
        RETURNING *
      `;
      return usuario ?? null;
    },

    async criarToken(usuarioId: number, nome: string, prefixo: string, hash: string) {
      const [token] = await sql<TokenCli[]>`
        INSERT INTO tokens_cli (usuario_id, nome, prefixo, hash)
        VALUES (${usuarioId}, ${nome}, ${prefixo}, ${hash})
        RETURNING id, usuario_id, nome, prefixo, criado_em, ultimo_uso, revogado_em
      `;
      if (!token) throw new Error("Falha ao criar token.");
      return token;
    },

    async listarTokens(usuarioId: number): Promise<readonly TokenCli[]> {
      return await sql<TokenCli[]>`
        SELECT id, usuario_id, nome, prefixo, criado_em, ultimo_uso, revogado_em
        FROM tokens_cli WHERE usuario_id = ${usuarioId} ORDER BY criado_em DESC
      `;
    },

    async revogarToken(usuarioId: number, tokenId: number): Promise<boolean> {
      const linhas = await sql`
        UPDATE tokens_cli SET revogado_em = now()
        WHERE id = ${tokenId} AND usuario_id = ${usuarioId} AND revogado_em IS NULL
        RETURNING id
      `;
      return linhas.length > 0;
    },

    async revogarTodosTokens(usuarioId: number): Promise<number> {
      const linhas = await sql`
        UPDATE tokens_cli SET revogado_em = now()
        WHERE usuario_id = ${usuarioId} AND revogado_em IS NULL
        RETURNING id
      `;
      return linhas.length;
    },

    /** Resolve o token do header em um usuário ativo. `null` = negar. */
    async autenticarToken(hash: string): Promise<{ usuario: Usuario; tokenId: number } | null> {
      const [linha] = await sql<(Usuario & { token_id: number })[]>`
        SELECT u.*, t.id AS token_id
        FROM tokens_cli t JOIN usuarios u ON u.id = t.usuario_id
        WHERE t.hash = ${hash} AND t.revogado_em IS NULL
      `;
      if (!linha) return null;
      const { token_id, ...usuario } = linha;
      return { tokenId: token_id, usuario: usuario as Usuario };
    },

    async tocarToken(tokenId: number): Promise<void> {
      await sql`UPDATE tokens_cli SET ultimo_uso = now() WHERE id = ${tokenId}`;
    },

    async consumoDoMes(usuarioId: number, competencia: string): Promise<ConsumoMes> {
      const [linha] = await sql<{ custo_micro: number; requisicoes: number; limite: number }[]>`
        SELECT COALESCE(m.custo_micro, 0) AS custo_micro,
               COALESCE(m.requisicoes, 0)       AS requisicoes,
               u.limite_mensal_micro            AS limite
        FROM usuarios u
        LEFT JOIN uso_mensal m ON m.usuario_id = u.id AND m.competencia = ${competencia}
        WHERE u.id = ${usuarioId}
      `;
      return {
        custoMicro: Number(linha?.custo_micro ?? 0),
        limiteMicro: Number(linha?.limite ?? 0),
        requisicoes: linha?.requisicoes ?? 0,
      };
    },

    /** Grava o evento e soma no agregado mensal numa transação só. */
    async registrarUso(dados: {
      usuarioId: number;
      tokenId: number | null;
      modelo: string;
      tokensEntrada: number;
      tokensSaida: number;
      tokensCache: number;
      tokensRaciocinio: number;
      custoMicro: number;
      duracaoMs: number;
      erro: string | null;
      competencia: string;
    }): Promise<void> {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO eventos_uso (usuario_id, token_id, modelo, tokens_entrada, tokens_saida,
                                   tokens_cache, tokens_raciocinio, custo_micro, duracao_ms, erro)
          VALUES (${dados.usuarioId}, ${dados.tokenId}, ${dados.modelo}, ${dados.tokensEntrada},
                  ${dados.tokensSaida}, ${dados.tokensCache}, ${dados.tokensRaciocinio},
                  ${dados.custoMicro}, ${dados.duracaoMs}, ${dados.erro})
        `;
        await tx`
          INSERT INTO uso_mensal (usuario_id, competencia, custo_micro, requisicoes)
          VALUES (${dados.usuarioId}, ${dados.competencia}, ${dados.custoMicro}, 1)
          ON CONFLICT (usuario_id, competencia) DO UPDATE
            SET custo_micro = uso_mensal.custo_micro + EXCLUDED.custo_micro,
                requisicoes = uso_mensal.requisicoes + 1
        `;
      });
    },

    async consumoDiario(
      usuarioId: number | null,
      dias: number,
    ): Promise<readonly { dia: string; custoMicro: number; requisicoes: number }[]> {
      const linhas = await sql<{ dia: string; custo: number; requisicoes: number }[]>`
        SELECT to_char(date_trunc('day', criado_em), 'YYYY-MM-DD') AS dia,
               sum(custo_micro)::bigint                            AS custo,
               count(*)::bigint                                    AS requisicoes
        FROM eventos_uso
        WHERE criado_em >= now() - (${dias} || ' days')::interval
          AND (${usuarioId ?? null}::bigint IS NULL OR usuario_id = ${usuarioId ?? null})
        GROUP BY 1 ORDER BY 1
      `;
      return linhas.map((l) => ({
        custoMicro: Number(l.custo),
        dia: l.dia,
        requisicoes: Number(l.requisicoes),
      }));
    },

    async topUsuarios(
      competencia: string,
      limite: number,
    ): Promise<readonly { email: string; custoMicro: number; requisicoes: number }[]> {
      const linhas = await sql<{ email: string; custo: number; requisicoes: number }[]>`
        SELECT u.email, m.custo_micro AS custo, m.requisicoes
        FROM uso_mensal m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.competencia = ${competencia}
        ORDER BY m.custo_micro DESC LIMIT ${limite}
      `;
      return linhas.map((l) => ({
        custoMicro: Number(l.custo),
        email: l.email,
        requisicoes: l.requisicoes,
      }));
    },

    async registrarAuditoria(dados: {
      atorId: number | null;
      atorEmail: string | null;
      acao: string;
      alvo: string | null;
      detalhe: unknown;
      ip: string | null;
    }): Promise<void> {
      await sql`
        INSERT INTO auditoria (ator_id, ator_email, acao, alvo, detalhe, ip)
        VALUES (${dados.atorId}, ${dados.atorEmail}, ${dados.acao}, ${dados.alvo},
                ${sql.json(dados.detalhe as never)}, ${dados.ip})
      `;
    },

    async listarAuditoria(filtros: { acao: string; limite: number; offset: number }) {
      return await sql<
        {
          id: number;
          ator_email: string | null;
          acao: string;
          alvo: string | null;
          detalhe: unknown;
          ip: string | null;
          criado_em: Date;
        }[]
      >`
        SELECT id, ator_email, acao, alvo, detalhe, ip, criado_em FROM auditoria
        WHERE ${filtros.acao === ""} OR acao = ${filtros.acao}
        ORDER BY criado_em DESC LIMIT ${filtros.limite} OFFSET ${filtros.offset}
      `;
    },

    async lerConfig(chave: string): Promise<string | null> {
      const [linha] = await sql<{ valor: string }[]>`
        SELECT valor FROM config WHERE chave = ${chave}
      `;
      return linha?.valor ?? null;
    },

    async gravarConfig(chave: string, valor: string): Promise<void> {
      await sql`
        INSERT INTO config (chave, valor) VALUES (${chave}, ${valor})
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor
      `;
    },

    async criarCodigoDispositivo(dados: {
      codigoDispositivo: string;
      codigoUsuario: string;
      expiraEm: Date;
    }): Promise<void> {
      await sql`
        INSERT INTO codigos_dispositivo (codigo_dispositivo, codigo_usuario, expira_em)
        VALUES (${dados.codigoDispositivo}, ${dados.codigoUsuario}, ${dados.expiraEm})
      `;
    },

    async buscarCodigoPorUsuario(codigoUsuario: string) {
      const [linha] = await sql<
        { codigo_dispositivo: string; usuario_id: number | null; expira_em: Date }[]
      >`
        SELECT codigo_dispositivo, usuario_id, expira_em FROM codigos_dispositivo
        WHERE codigo_usuario = ${codigoUsuario}
      `;
      return linha ?? null;
    },

    async aprovarCodigoDispositivo(
      codigoUsuario: string,
      usuarioId: number,
      tokenTexto: string,
    ): Promise<boolean> {
      const linhas = await sql`
        UPDATE codigos_dispositivo SET usuario_id = ${usuarioId}, token_texto = ${tokenTexto}
        WHERE codigo_usuario = ${codigoUsuario} AND expira_em > now() AND token_texto IS NULL
        RETURNING codigo_dispositivo
      `;
      return linhas.length > 0;
    },

    /** Consome o código: devolve o token uma vez só e apaga a linha. */
    async resgatarCodigoDispositivo(
      codigoDispositivo: string,
    ): Promise<string | null | "expirado"> {
      const [linha] = await sql<{ token_texto: string | null; expira_em: Date }[]>`
        SELECT token_texto, expira_em FROM codigos_dispositivo
        WHERE codigo_dispositivo = ${codigoDispositivo}
      `;
      if (!linha) return "expirado";
      if (linha.expira_em.getTime() <= Date.now()) {
        await sql`DELETE FROM codigos_dispositivo WHERE codigo_dispositivo = ${codigoDispositivo}`;
        return "expirado";
      }
      if (linha.token_texto === null) return null;
      await sql`DELETE FROM codigos_dispositivo WHERE codigo_dispositivo = ${codigoDispositivo}`;
      return linha.token_texto;
    },

    async limparCodigosExpirados(): Promise<void> {
      await sql`DELETE FROM codigos_dispositivo WHERE expira_em < now() - interval '1 day'`;
    },
  };
}

export type Repositorio = ReturnType<typeof criarRepositorio>;
