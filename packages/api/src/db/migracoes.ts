/**
 * Migrations em SQL puro, aplicadas em ordem e registradas em `_migracoes`.
 *
 * Decisão (desvio do doc 03, que previa Drizzle): SQL direto + `postgres.js`.
 * Menos dependências, sem etapa de codegen, e o schema fica legível num arquivo só —
 * o que importa num projeto de uma pessoa. Migrations são imutáveis: para mudar o
 * schema, **acrescente** uma nova entrada; nunca edite uma já aplicada.
 */
export type Migracao = {
  readonly id: string;
  readonly sql: string;
};

export const MIGRACOES: readonly Migracao[] = Object.freeze([
  {
    id: "0001_inicial",
    sql: `
      CREATE TABLE usuarios (
        id                    bigserial PRIMARY KEY,
        email                 text        NOT NULL UNIQUE,
        senha_hash            text        NOT NULL,
        nome                  text        NOT NULL,
        status                text        NOT NULL DEFAULT 'pendente',
        admin                 boolean     NOT NULL DEFAULT false,
        email_verificado      boolean     NOT NULL DEFAULT false,
        codigo_verificacao    text,
        limite_mensal_micro   bigint      NOT NULL DEFAULT 2000000,
        criado_em             timestamptz NOT NULL DEFAULT now(),
        ultimo_login          timestamptz,
        CONSTRAINT usuarios_status_valido CHECK (status IN ('pendente','ativo','bloqueado'))
      );

      CREATE TABLE tokens_cli (
        id           bigserial PRIMARY KEY,
        usuario_id   bigint      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        nome         text        NOT NULL,
        prefixo      text        NOT NULL,
        hash         text        NOT NULL UNIQUE,
        criado_em    timestamptz NOT NULL DEFAULT now(),
        ultimo_uso   timestamptz,
        revogado_em  timestamptz
      );
      CREATE INDEX tokens_cli_usuario_idx ON tokens_cli (usuario_id);

      CREATE TABLE eventos_uso (
        id                bigserial PRIMARY KEY,
        usuario_id        bigint      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token_id          bigint      REFERENCES tokens_cli(id) ON DELETE SET NULL,
        criado_em         timestamptz NOT NULL DEFAULT now(),
        modelo            text        NOT NULL,
        tokens_entrada    integer     NOT NULL DEFAULT 0,
        tokens_saida      integer     NOT NULL DEFAULT 0,
        tokens_cache      integer     NOT NULL DEFAULT 0,
        tokens_raciocinio integer     NOT NULL DEFAULT 0,
        custo_micro       bigint      NOT NULL DEFAULT 0,
        duracao_ms        integer     NOT NULL DEFAULT 0,
        erro              text
      );
      CREATE INDEX eventos_uso_usuario_data_idx ON eventos_uso (usuario_id, criado_em DESC);
      CREATE INDEX eventos_uso_data_idx ON eventos_uso (criado_em DESC);

      CREATE TABLE uso_mensal (
        usuario_id   bigint  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        competencia  text    NOT NULL,
        custo_micro  bigint  NOT NULL DEFAULT 0,
        requisicoes  integer NOT NULL DEFAULT 0,
        PRIMARY KEY (usuario_id, competencia)
      );

      CREATE TABLE auditoria (
        id         bigserial PRIMARY KEY,
        ator_id    bigint      REFERENCES usuarios(id) ON DELETE SET NULL,
        ator_email text,
        acao       text        NOT NULL,
        alvo       text,
        detalhe    jsonb,
        ip         text,
        criado_em  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX auditoria_data_idx ON auditoria (criado_em DESC);

      CREATE TABLE codigos_dispositivo (
        codigo_dispositivo text        PRIMARY KEY,
        codigo_usuario     text        NOT NULL UNIQUE,
        usuario_id         bigint      REFERENCES usuarios(id) ON DELETE CASCADE,
        token_texto        text,
        expira_em          timestamptz NOT NULL,
        criado_em          timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE config (
        chave text PRIMARY KEY,
        valor text NOT NULL
      );
      INSERT INTO config (chave, valor) VALUES ('kill_switch', 'off');
    `,
  },
]);
