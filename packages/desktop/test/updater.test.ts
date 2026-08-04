import { describe, expect, it } from "vitest";
import { initialUpdateState, isNewerVersion, releaseNotesToText } from "../src/shared/updater.js";

describe("updater state", () => {
  it("compara versões sem aceitar valores ambíguos", () => {
    expect(isNewerVersion("1.2.0", "1.1.1")).toBe(true);
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
    expect(isNewerVersion("inválida", "1.1.1")).toBe(false);
  });

  it("inicia sem baixar nem instalar e normaliza notas", () => {
    expect(initialUpdateState("1.2.0", "nsis")).toEqual({
      currentVersion: "1.2.0",
      mode: "nsis",
      status: "idle",
    });
    expect(releaseNotesToText([{ note: "Projetos" }, { note: "Updater" }])).toBe(
      "Projetos\n\nUpdater",
    );
  });
});
