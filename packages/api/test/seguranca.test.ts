import { describe, expect, it } from "vitest";
import {
  assinarSessao,
  conferirSenha,
  gerarCodigoUsuario,
  gerarCodigoVerificacao,
  gerarTokenCli,
  hashSenha,
  hashToken,
  lerSessao,
  normalizarEmail,
  validarForcaSenha,
} from "../src/seguranca.js";

describe("senhas", () => {
  it("faz hash e confere a senha certa", async () => {
    const hash = await hashSenha("minhaSenha123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await conferirSenha("minhaSenha123", hash)).toBe(true);
  });

  it("recusa senha errada", async () => {
    const hash = await hashSenha("minhaSenha123");
    expect(await conferirSenha("outraSenha123", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (sal aleatório)", async () => {
    expect(await hashSenha("igual12345")).not.toBe(await hashSenha("igual12345"));
  });

  it("não estoura com hash malformado — só devolve false", async () => {
    expect(await conferirSenha("x", "lixo")).toBe(false);
    expect(await conferirSenha("x", "scrypt$zz$zz")).toBe(false);
    expect(await conferirSenha("x", "bcrypt$aa$bb")).toBe(false);
  });

  it("cobra senha com letra, número e 8+ caracteres", () => {
    expect(validarForcaSenha("curta1")).toMatch(/8 caracteres/);
    expect(validarForcaSenha("12345678")).toMatch(/letra/);
    expect(validarForcaSenha("abcdefgh")).toMatch(/número/);
    expect(validarForcaSenha("x".repeat(201))).toMatch(/longa/);
    expect(validarForcaSenha("senhaBoa123")).toBeNull();
  });
});

describe("normalizarEmail", () => {
  it("apara e baixa a caixa", () => {
    expect(normalizarEmail("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
  });

  it("recusa entradas inválidas", () => {
    for (const invalido of ["", "sem-arroba", "a@b", "a@b.c", "x@y.z ainda@w.co", "@exemplo.com"]) {
      expect(normalizarEmail(invalido)).toBeNull();
    }
  });
});

describe("tokens de CLI", () => {
  it("gera token com prefixo cp_ e hash estável", () => {
    const token = gerarTokenCli();
    expect(token.texto.startsWith("cp_")).toBe(true);
    expect(token.prefixo).toBe(token.texto.slice(0, 11));
    expect(token.hash).toBe(hashToken(token.texto));
    expect(token.hash).toHaveLength(64);
  });

  it("não repete tokens", () => {
    const vistos = new Set(Array.from({ length: 50 }, () => gerarTokenCli().texto));
    expect(vistos.size).toBe(50);
  });
});

describe("códigos", () => {
  it("código de dispositivo tem formato ABCD-EFGH sem letras ambíguas", () => {
    for (let i = 0; i < 30; i += 1) {
      const codigo = gerarCodigoUsuario();
      expect(codigo).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
      );
      expect(codigo).not.toMatch(/[IO01]/);
    }
  });

  it("código de verificação tem 6 dígitos", () => {
    for (let i = 0; i < 30; i += 1) {
      expect(gerarCodigoVerificacao()).toMatch(/^\d{6}$/);
    }
  });
});

describe("sessão assinada", () => {
  const segredo = "segredo-de-teste-com-mais-de-32-caracteres!!";

  it("assina e lê de volta o id do usuário", () => {
    const sessao = lerSessao(assinarSessao(42, segredo), segredo);
    expect(sessao?.usuarioId).toBe(42);
  });

  it("recusa assinatura de outro segredo", () => {
    expect(lerSessao(assinarSessao(42, segredo), "outro-segredo-bem-diferente-aqui!!")).toBeNull();
  });

  it("recusa cookie adulterado ou malformado", () => {
    const bom = assinarSessao(42, segredo);
    expect(lerSessao(bom.replace("42", "43"), segredo)).toBeNull();
    expect(lerSessao("a.b", segredo)).toBeNull();
    expect(lerSessao("x.y.z", segredo)).toBeNull();
    expect(lerSessao("", segredo)).toBeNull();
  });

  it("recusa sessão expirada", () => {
    const antigo = assinarSessao(1, segredo, Date.now() - 40 * 24 * 60 * 60 * 1000);
    expect(lerSessao(antigo, segredo)).toBeNull();
  });
});
