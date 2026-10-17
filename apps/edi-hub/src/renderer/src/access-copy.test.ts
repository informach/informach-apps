import type { DesktopStatus } from "@informach/edi-desktop/contracts";
import { describe, expect, it } from "vitest";
import { describeAccess, formatUntil, hubUpdateNotice, restrictedPanel } from "./access-copy";

const base: DesktopStatus = {
  state: "restricted",
  cause: "signed_out",
  reason: "Conecte sua conta para validar a assinatura.",
  userId: null,
  expiresAt: null,
  offline: false,
  userCode: null,
  verificationUri: null,
  update: "idle",
};
const zone = "America/Sao_Paulo";
const plain = (value: string) => value.replace(/\s/g, " ");
const restricted = (cause: DesktopStatus["cause"], userId: string | null = "u1") =>
  describeAccess({ ...base, cause, userId, reason: "Motivo do controlador." });

describe("Hub access copy", () => {
  it("shows how long a licensed computer works offline", () => {
    const copy = describeAccess(
      { ...base, state: "licensed", cause: null, userId: "u1", expiresAt: "2026-10-20T17:00:00Z" },
      zone,
    );
    expect(copy.title).toBe("Assinatura ativa");
    expect(plain(copy.detail)).toBe("Funciona sem internet até ter., 20/10, às 14:00.");
    expect(plain(formatUntil("2026-10-23T17:00:00Z", zone))).toBe("sex., 23/10, às 14:00");
  });
  it("tells an offline session when to reconnect", () => {
    const copy = describeAccess(
      {
        ...base,
        state: "licensed",
        cause: null,
        userId: "u1",
        offline: true,
        expiresAt: "2026-10-20T17:00:00Z",
      },
      zone,
    );
    expect(copy.tone).toBe("offline");
    expect(copy.detail).toMatch(/Conecte-se antes disso/);
  });
  it("offers to connect a computer without an account, and the subscription to an unpaid one", () => {
    expect(describeAccess(base).action).toBe("connect");
    const blocked = restricted("subscription_required");
    expect(blocked).toMatchObject({ tone: "blocked", action: "subscription" });
    expect(blocked.detail).toBe("Motivo do controlador.");
  });
  it("picks the next step from the cause, not from whether an account is known", () => {
    expect(restricted("offline")).toMatchObject({ tone: "offline", action: "retry" });
    expect(restricted("offline", null)).toMatchObject({ tone: "offline", action: "retry" });
    expect(restricted("expired")).toMatchObject({ tone: "offline", action: "retry" });
    expect(restricted("update_required")).toMatchObject({ action: "update" });
    expect(restricted("device_limit")).toMatchObject({ tone: "blocked", action: "devices" });
    for (const cause of [
      "invalid_proof",
      "device_revoked",
      "session_revoked",
      "revalidate",
    ] as const)
      expect(restricted(cause)).toMatchObject({ tone: "disconnected", action: "connect" });
  });
  it("always lets a blocked computer connect another account and sign out", () => {
    for (const cause of ["subscription_required", "payment_required", "device_limit"] as const)
      expect(restrictedPanel(restricted(cause), true)).toEqual({
        primary: cause === "device_limit" ? "devices" : "subscription",
        connectLabel: "Conectar outra conta",
        retry: true,
        signOut: true,
      });
    expect(restrictedPanel(restricted("invalid_proof"), true)).toEqual({
      primary: "connect",
      connectLabel: "Conectar minha conta",
      retry: true,
      signOut: true,
    });
    expect(restrictedPanel(restricted("offline", null), false)).toMatchObject({
      primary: "retry",
      connectLabel: "Conectar minha conta",
      retry: false,
      signOut: false,
    });
  });
  it("only announces Hub updates worth reading", () => {
    expect(hubUpdateNotice("idle")).toBeNull();
    expect(hubUpdateNotice("checking")).toBeNull();
    expect(hubUpdateNotice("ready")).toMatch(/próxima vez que o Hub fechar/);
  });
});
