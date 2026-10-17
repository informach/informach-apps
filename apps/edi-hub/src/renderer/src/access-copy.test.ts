import type { DesktopStatus } from "@informach/edi-desktop/contracts";
import { describe, expect, it } from "vitest";
import { describeAccess, formatUntil, hubUpdateNotice } from "./access-copy";

const base: DesktopStatus = {
  state: "restricted",
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

describe("Hub access copy", () => {
  it("shows how long a licensed computer works offline", () => {
    const copy = describeAccess(
      { ...base, state: "licensed", userId: "u1", expiresAt: "2026-10-20T17:00:00Z" },
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
        userId: "u1",
        offline: true,
        expiresAt: "2026-10-20T17:00:00Z",
      },
      zone,
    );
    expect(copy.tone).toBe("offline");
    expect(copy.detail).toMatch(/Conecte-se antes disso/);
  });
  it("offers to connect a computer without an account, and the subscription to a blocked one", () => {
    expect(describeAccess(base).action).toBe("connect");
    const blocked = describeAccess({
      ...base,
      userId: "u1",
      reason: "Esta conta não tem uma assinatura ativa.",
    });
    expect(blocked).toMatchObject({ tone: "blocked", action: "subscription" });
    expect(blocked.detail).toBe("Esta conta não tem uma assinatura ativa.");
  });
  it("only announces Hub updates worth reading", () => {
    expect(hubUpdateNotice("idle")).toBeNull();
    expect(hubUpdateNotice("checking")).toBeNull();
    expect(hubUpdateNotice("ready")).toMatch(/próxima vez que o Hub fechar/);
  });
});
