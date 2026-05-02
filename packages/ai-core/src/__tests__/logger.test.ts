import { describe, expect, it } from "vitest";
import { createDefaultLogger } from "../logger";

describe("createDefaultLogger", () => {
  it("retorna um logger com métodos debug/info/warn/error", () => {
    const logger = createDefaultLogger({ name: "test-app" });
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("aceita level customizado sem lançar", () => {
    expect(() => createDefaultLogger({ name: "x", level: "debug" })).not.toThrow();
    expect(() => createDefaultLogger({ name: "x", level: "warn" })).not.toThrow();
  });

  it("aceita prettyPrint:false (formato JSON em prod)", () => {
    expect(() => createDefaultLogger({ name: "x", prettyPrint: false })).not.toThrow();
  });
});
