import { afterEach, describe, expect, it, vi } from "vitest";
import { webAuthLogger } from "./web-auth-logger";

afterEach(() => vi.restoreAllMocks());
describe("web identity operational logging", () => {
  it("never forwards provider arguments containing credentials or identity", () => {
    const events: unknown[] = [];
    const logger = webAuthLogger("cozya", (event) => {
      events.push(event);
    });
    logger.log("error", "Callback failed with state=secret-value", {
      token: "private",
      email: "private@example.test",
    });
    expect(events).toEqual([
      { type: "auth_provider_log", metadata: { app: "cozya", level: "error" } },
    ]);
  });
  it("retains a safe fallback if the observation hook fails", () => {
    const output = vi.spyOn(console, "warn").mockImplementation(() => {});
    webAuthLogger("conta", () => {
      throw new Error("private credential");
    }).log("warn", new Error("secret callback"));
    expect(output).toHaveBeenCalledWith(
      '{"operation":"auth.provider_log","app":"conta","level":"warn"}',
    );
  });
  it("handles a rejected asynchronous observer without logging its payload", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    webAuthLogger("conta", async () => {
      throw new Error("private async credential");
    }).log("error", "secret");
    await Promise.resolve();
    expect(output).toHaveBeenCalledWith(
      '{"operation":"auth.provider_log","app":"conta","level":"error"}',
    );
  });
});
