import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ values: vi.fn() }));
vi.mock("@informach/db", () => ({ db: { insert: () => ({ values: database.values }) } }));

import {
  AuditPersistenceError,
  configureObservability,
  logAuditEvent,
  logAuditEventStrict,
} from "../audit";

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

describe("strict audit (opt-in)", () => {
  it("resolves once the row is written", async () => {
    database.values.mockResolvedValue(undefined);
    await expect(
      logAuditEventStrict("admin.user_viewed", "staff", { targetId: "t" }),
    ).resolves.toBe(undefined);
    expect(database.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "admin.user_viewed", actorId: "staff" }),
    );
  });

  it("reports and throws when the row cannot be written, so the caller can fail closed", async () => {
    database.values.mockRejectedValue(new Error("database unavailable"));
    const onAuditPersistenceFailure = vi.fn();
    configureObservability({ onAuditPersistenceFailure });
    const attempt = logAuditEventStrict("admin.audit_exported", "staff", { rows: 3 });
    await expect(attempt).rejects.toBeInstanceOf(AuditPersistenceError);
    await expect(attempt).rejects.toMatchObject({ eventType: "admin.audit_exported" });
    expect(onAuditPersistenceFailure).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "admin.audit_exported", payloadKeys: ["rows"] }),
    );
  });

  it("writes through the given transaction instead of the shared client", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const writer = { insert: vi.fn(() => ({ values })) };
    await logAuditEventStrict(
      "user.role_changed",
      "owner",
      { targetId: "t" },
      { writer: writer as never },
    );
    expect(values).toHaveBeenCalledOnce();
    expect(database.values).not.toHaveBeenCalled();
  });

  it("keeps the default form best-effort for every other app", async () => {
    database.values.mockRejectedValue(new Error("database unavailable"));
    await expect(logAuditEvent("user.created", "owner", {})).resolves.toBe(undefined);
  });
});
