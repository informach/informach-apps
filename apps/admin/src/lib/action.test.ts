import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const strict = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());
const guards = vi.hoisted(() => ({
  staff: vi.fn(),
  owner: vi.fn(),
  setup: vi.fn(),
}));

vi.mock("@informach/auth", () => {
  class ForbiddenError extends Error {}
  class LastOwnerError extends ForbiddenError {}
  class UnauthorizedError extends Error {}
  class AuditPersistenceError extends Error {
    constructor(eventType: string, cause?: unknown) {
      super(eventType, { cause });
    }
  }
  return {
    AuditPersistenceError,
    ForbiddenError,
    LastOwnerError,
    UnauthorizedError,
    logAuditEventStrict: strict,
  };
});
vi.mock("@informach/auth/server-actions", () => ({
  enforceRateLimit: vi.fn(async () => undefined),
  postgresRateLimitStorage: {},
  RateLimitError: class RateLimitError extends Error {},
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("./access", () => ({
  requireStaffForAction: guards.staff,
  requireOwnerForAction: guards.owner,
  requireTwoFactorSetupForAction: guards.setup,
}));
vi.mock("./observability", () => ({ reportOperationalError: report }));

import { AuditPersistenceError, LastOwnerError } from "@informach/auth";
import { auditAs, auditChange, staffAction, twoFactorSetupAction } from "./action";

const staff = { id: "staff-1", name: "Helena", email: "h@example.test", role: "owner" as const };

beforeEach(() => {
  strict.mockReset();
  report.mockReset();
  guards.staff.mockResolvedValue(staff);
  guards.owner.mockResolvedValue(staff);
  guards.setup.mockResolvedValue({ staff, sessionId: "sessao-1" });
});

describe("auditoria das ações do Bastidores", () => {
  it("auditAs usa a forma estrita e deixa a falha subir", async () => {
    strict.mockRejectedValueOnce(new AuditPersistenceError("admin.user_viewed", new Error("db")));
    await expect(auditAs(staff, "admin.user_viewed", { targetId: "t" })).rejects.toBeInstanceOf(
      AuditPersistenceError,
    );
    expect(strict).toHaveBeenCalledWith("admin.user_viewed", "staff-1", { targetId: "t" });
  });

  it("auditChange só dá a ação por concluída com o evento gravado", async () => {
    strict.mockResolvedValueOnce(undefined);
    const result = await auditChange(staff, "admin.sessions_revoked", { targetId: "t" }, "Feito.");
    expect(result).toEqual({
      ok: true,
      message: "Feito. O registro entrou na auditoria em seu nome.",
    });
  });

  it("auditChange mostra erro e reporta quando a mudança aconteceu sem registro", async () => {
    strict.mockRejectedValueOnce(new AuditPersistenceError("admin.user_viewed", new Error("db")));
    const result = await auditChange(
      staff,
      "admin.sessions_revoked",
      { targetId: "t", reason: "texto da equipe" },
      "2 sessões encerradas.",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("2 sessões encerradas.");
    expect(result.error).toContain("registro na auditoria não gravou");
    expect(report).toHaveBeenCalledWith(
      "audit.change_unrecorded",
      expect.any(AuditPersistenceError),
      expect.objectContaining({ actorId: "staff-1", payloadKeys: ["targetId", "reason"] }),
    );
  });
});

describe("erros das ações", () => {
  it("o último owner tem frase própria", async () => {
    const action = staffAction({
      schema: z.object({}),
      run: async () => {
        throw new LastOwnerError();
      },
    });
    const result = await action({});
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("sem nenhuma conta owner ativa");
  });

  it("auditoria estrita que falha dentro da transação diz que nada mudou", async () => {
    const action = staffAction({
      schema: z.object({}),
      run: async () => {
        throw new AuditPersistenceError("admin.user_viewed", new Error("db"));
      },
    });
    const result = await action({});
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("nada foi alterado");
    expect(report).not.toHaveBeenCalled();
  });

  it("a ação da ativação recebe a sessão da guarda própria", async () => {
    const run = vi.fn(async () => ({ ok: true as const, message: "ok" }));
    const action = twoFactorSetupAction({ schema: z.object({}), run });
    await action({});
    expect(guards.setup).toHaveBeenCalledOnce();
    expect(guards.staff).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith({}, { staff, sessionId: "sessao-1" });
  });
});
