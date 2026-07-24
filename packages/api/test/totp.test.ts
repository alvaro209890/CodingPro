import { describe, expect, it } from "vitest";
import { gerarSegredoTotp, otpauthUrl, verificarTotp } from "../src/seguranca.js";

describe("TOTP RFC 6238", () => {
  it("gera segredo base32 de 20 bytes", () => {
    const segredo = gerarSegredoTotp();
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect(segredo).not.toContain("=");
  });

  it("valida código SHA-1 com janela de um passo", () => {
    // Segredo ASCII "12345678901234567890" em base32, usado nos vetores do RFC 6238.
    const segredo = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verificarTotp(segredo, "287082", 59_000)).toBe(true);
    expect(verificarTotp(segredo, "287082", 89_000)).toBe(true);
    expect(verificarTotp(segredo, "287082", 120_000)).toBe(false);
  });

  it("monta URL otpauth compatível com autenticadores", () => {
    const url = new URL(otpauthUrl("dev@teste.com", "ABCDEF234567", "CodingPro"));
    expect(url.protocol).toBe("otpauth:");
    expect(url.hostname).toBe("totp");
    expect(url.searchParams.get("secret")).toBe("ABCDEF234567");
    expect(url.searchParams.get("issuer")).toBe("CodingPro");
    expect(url.searchParams.get("algorithm")).toBe("SHA1");
    expect(url.searchParams.get("digits")).toBe("6");
    expect(url.searchParams.get("period")).toBe("30");
  });
});
