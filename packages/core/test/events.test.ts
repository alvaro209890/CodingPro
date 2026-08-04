import { describe, expect, it } from "vitest";
import { CORE_UI_EVENT_PROTOCOL_VERSION, type CoreUiEvent } from "../src/events.js";

describe("events contract", () => {
  it("deve exportar a versão correta do protocolo CORE_UI_EVENT_PROTOCOL_VERSION", () => {
    expect(CORE_UI_EVENT_PROTOCOL_VERSION).toBe("1.5.0");
  });

  it("deve permitir construir envelopes válidos do protocolo", () => {
    const eventPayload: CoreUiEvent = {
      event: { text: "teste", type: "text-delta" },
      type: "agent-event",
    };
    expect(eventPayload.type).toBe("agent-event");
  });

  it("permission-request carrega requestId para a UI correlacionar a resposta", () => {
    const eventPayload: CoreUiEvent = {
      request: { sideEffect: "exec", toolName: "bash" },
      requestId: "perm-1",
      type: "permission-request",
    };
    expect(eventPayload.requestId).toBe("perm-1");
  });

  it("model-info carrega o modelo/effort real do turno (v1.4.0)", () => {
    const eventPayload: CoreUiEvent = {
      effort: "fast",
      modelName: "DeepSeek V4 Flash",
      type: "model-info",
    };
    expect(eventPayload.modelName).toBe("DeepSeek V4 Flash");
    expect(eventPayload.effort).toBe("fast");
  });
});
