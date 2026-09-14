import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ values: vi.fn() }));
vi.mock("@informach/db", () => ({ db: { insert: () => ({ values: database.values }) } }));

import { configureObservability, logAuditEvent } from "../audit";

beforeEach(() => {
  configureObservability(undefined);
  database.values.mockReset();
});
describe("audit hooks without auth initialization", () => {
  it("reports database failure through the caller's hook even on webhook-only processes", async () => {
    database.values.mockRejectedValue(new Error("database unavailable"));
    const onAuditPersistenceFailure = vi.fn();
    await logAuditEvent(
      "billing.payment_succeeded",
      "owner",
      { app: "missao-saber" },
      { onAuditPersistenceFailure },
    );
    expect(onAuditPersistenceFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.payment_succeeded",
        actorId: "owner",
        payloadKeys: ["app"],
      }),
    );
  });
  it("keeps the configured hook for existing callers", async () => {
    database.values.mockRejectedValue(new Error("database unavailable"));
    const onAuditPersistenceFailure = vi.fn();
    configureObservability({ onAuditPersistenceFailure });
    await logAuditEvent("user.created", "owner", {});
    expect(onAuditPersistenceFailure).toHaveBeenCalledOnce();
  });
});
