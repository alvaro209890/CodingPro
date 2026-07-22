import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ROLE,
  DEEPSEEK_MODEL_FLASH,
  DEEPSEEK_MODEL_PRO,
  DeepSeekProvider,
  isModelRole,
  MODEL_ROLE_FAST,
  MODEL_ROLE_MAIN,
  MODEL_ROLES,
  parseModelRole,
  resolveDeepSeekModelForRole,
  resolveDeepSeekProviderModel,
  ROLE_MODEL_FLASH,
  ROLE_MODEL_PRO,
} from "../src/index.js";

describe("roteamento de papéis DeepSeek", () => {
  it("mantém a allowlist de papéis fechada e imutável", () => {
    expect(MODEL_ROLES).toEqual(["auto", "main", "fast"]);
    expect(Object.isFrozen(MODEL_ROLES)).toBe(true);
    expect(() => (MODEL_ROLES as unknown as string[]).push("turbo")).toThrow(TypeError);
    expect(DEFAULT_MODEL_ROLE).toBe("auto");
    expect(MODEL_ROLE_MAIN).toBe("main");
    expect(MODEL_ROLE_FAST).toBe("fast");
  });

  it("espelha os IDs allowlisted do provider", () => {
    expect(ROLE_MODEL_PRO).toBe(DEEPSEEK_MODEL_PRO);
    expect(ROLE_MODEL_FLASH).toBe(DEEPSEEK_MODEL_FLASH);
    expect(ROLE_MODEL_PRO).toBe("deepseek-v4-pro");
    expect(ROLE_MODEL_FLASH).toBe("deepseek-v4-flash");
  });

  it.each([
    { role: "auto" as const, model: DEEPSEEK_MODEL_PRO },
    { role: "main" as const, model: DEEPSEEK_MODEL_PRO },
    { role: "fast" as const, model: DEEPSEEK_MODEL_FLASH },
  ])("resolve $role → $model", ({ role, model }) => {
    expect(resolveDeepSeekModelForRole(role)).toBe(model);
  });

  it("usa auto→Pro quando o papel é omitido", () => {
    expect(resolveDeepSeekModelForRole()).toBe(DEEPSEEK_MODEL_PRO);
  });

  it("resolveDeepSeekModelForRole falha no ramo exaustivo com papel forjado", () => {
    expect(() => resolveDeepSeekModelForRole("turbo" as never)).toThrowError(
      expect.objectContaining({
        code: "not-configured",
        safeMessage: expect.stringContaining("papel"),
      }),
    );
  });

  it("parseModelRole e isModelRole falham fechado para valores inválidos", () => {
    for (const role of MODEL_ROLES) {
      expect(isModelRole(role)).toBe(true);
      expect(parseModelRole(role)).toBe(role);
    }

    for (const invalid of [
      "turbo",
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "openai",
      "",
      " main ",
      0,
      null,
      undefined,
      {},
      [],
    ]) {
      expect(isModelRole(invalid)).toBe(false);
      expect(() => parseModelRole(invalid)).toThrowError(
        expect.objectContaining({
          code: "not-configured",
          safeMessage: expect.stringContaining("papel"),
        }),
      );
    }
  });

  it("resolveDeepSeekProviderModel: role, model, default e inconsistência", () => {
    expect(resolveDeepSeekProviderModel({})).toBe(DEEPSEEK_MODEL_PRO);
    expect(resolveDeepSeekProviderModel({ role: "auto" })).toBe(DEEPSEEK_MODEL_PRO);
    expect(resolveDeepSeekProviderModel({ role: "main" })).toBe(DEEPSEEK_MODEL_PRO);
    expect(resolveDeepSeekProviderModel({ role: "fast" })).toBe(DEEPSEEK_MODEL_FLASH);
    expect(resolveDeepSeekProviderModel({ model: DEEPSEEK_MODEL_PRO })).toBe(DEEPSEEK_MODEL_PRO);
    expect(resolveDeepSeekProviderModel({ model: DEEPSEEK_MODEL_FLASH })).toBe(
      DEEPSEEK_MODEL_FLASH,
    );
    expect(resolveDeepSeekProviderModel({ model: DEEPSEEK_MODEL_PRO, role: "main" })).toBe(
      DEEPSEEK_MODEL_PRO,
    );
    expect(resolveDeepSeekProviderModel({ model: DEEPSEEK_MODEL_FLASH, role: "fast" })).toBe(
      DEEPSEEK_MODEL_FLASH,
    );

    expect(() => resolveDeepSeekProviderModel({ role: "turbo" })).toThrowError(
      expect.objectContaining({ code: "not-configured" }),
    );
    expect(() => resolveDeepSeekProviderModel({ model: "deepseek-inventado" })).toThrowError(
      expect.objectContaining({ code: "not-configured" }),
    );
    expect(() =>
      resolveDeepSeekProviderModel({ model: DEEPSEEK_MODEL_PRO, role: "fast" }),
    ).toThrowError(
      expect.objectContaining({
        code: "not-configured",
        safeMessage: expect.stringContaining("inconsistentes"),
      }),
    );
  });

  it("DeepSeekProvider aplica role e rejeita papel inválido sem vazar a chave", () => {
    const chave = "segredo-que-nao-pode-vazar";
    const main = new DeepSeekProvider({ apiKey: chave, role: "main" });
    const auto = new DeepSeekProvider({ apiKey: chave, role: "auto" });
    const fast = new DeepSeekProvider({ apiKey: chave, role: "fast" });
    const padrao = new DeepSeekProvider({ apiKey: chave });

    expect(main.model).toBe(DEEPSEEK_MODEL_PRO);
    expect(auto.model).toBe(DEEPSEEK_MODEL_PRO);
    expect(fast.model).toBe(DEEPSEEK_MODEL_FLASH);
    expect(padrao.model).toBe(DEEPSEEK_MODEL_PRO);

    try {
      new DeepSeekProvider({ apiKey: chave, role: "turbo" as never });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "not-configured" });
      expect(String(error)).not.toContain(chave);
    }

    try {
      new DeepSeekProvider({
        apiKey: chave,
        model: DEEPSEEK_MODEL_PRO,
        role: "fast",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "not-configured" });
      expect(String(error)).not.toContain(chave);
    }
  });
});
