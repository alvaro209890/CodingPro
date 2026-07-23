import { describe, expect, it } from "vitest";
import { CORE_UI_EVENT_PROTOCOL_VERSION, type CoreUiEvent } from "../src/events.js";

describe("events contract", () => {
  it("deve exportar a versão correta do protocolo CORE_UI_EVENT_PROTOCOL_VERSION", () => {
    expect(CORE_UI_EVENT_PROTOCOL_VERSION).toBe("1.0.0");
  });

  it("deve permitir construir envelopes válidos do protocolo", () => {
    const eventPayload: CoreUiEvent = {
      event: { text: "teste", type: "text-delta" },
      type: "agent-event",
    };
    expect(eventPayload.type).toBe("agent-event");
  });
});
