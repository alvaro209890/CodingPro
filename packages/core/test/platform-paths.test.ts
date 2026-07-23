import { describe, expect, it } from "vitest";
import {
  getGlobalConfigDir,
  getGlobalMemoryDir,
  normalizePlatformPath,
} from "../src/platform-paths.js";

describe("platform-paths", () => {
  it("deve retornar o diretório global de configuração correto segundo o sistema operacional", () => {
    const configDir = getGlobalConfigDir();
    expect(configDir).toBeTypeOf("string");
    expect(configDir.length).toBeGreaterThan(0);
    if (process.platform === "win32") {
      expect(configDir).toContain("CodingPro");
    } else {
      expect(configDir).toContain(".codingpro");
    }
  });

  it("deve retornar o diretório global de memória", () => {
    const memoryDir = getGlobalMemoryDir();
    expect(memoryDir).toContain("memory");
  });

  it("deve normalizar letras de unidade no Windows quando aplicável", () => {
    if (process.platform === "win32") {
      const norm = normalizePlatformPath("c:\\temp\\test");
      expect(norm.startsWith("C:\\")).toBe(true);
    } else {
      const norm = normalizePlatformPath("/tmp/test");
      expect(norm).toBe("/tmp/test");
    }
  });
});
