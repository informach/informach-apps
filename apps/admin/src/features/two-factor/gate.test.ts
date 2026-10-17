import { describe, expect, it, vi } from "vitest";
import { type AuthGateDeps, guardAuthRequest } from "./gate";

const ORIGIN = "https://admin.example.test";

function post(path: string, body?: unknown, type = "application/json") {
  return new Request(`${ORIGIN}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": type },
    body:
      body === undefined ? undefined : type.includes("json") ? JSON.stringify(body) : String(body),
  });
}

function deps(overrides: Partial<AuthGateDeps> = {}) {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  return {
    handler,
    currentSession: vi.fn(async () => ({ sessionId: "sessao-1", userId: "u1" })),
    takeProof: vi.fn(async () => ({ expiresAt: new Date("2026-10-17T12:10:00Z") })),
    restoreProof: vi.fn(async () => undefined),
    report: vi.fn(),
    ...overrides,
  } satisfies AuthGateDeps;
}

describe("rota de autenticação do Bastidores", () => {
  it("responde 404 para o que está fora da lista fechada", async () => {
    const gate = deps();
    const response = await guardAuthRequest(post("/sign-in/magic-link", {}), gate);
    expect(response.status).toBe(404);
    expect(gate.handler).not.toHaveBeenCalled();
  });

  it("repassa a entrada com senha como antes", async () => {
    const gate = deps();
    const response = await guardAuthRequest(post("/sign-in/email", { email: "a@b.c" }), gate);
    expect(response.status).toBe(200);
    expect(gate.handler).toHaveBeenCalledOnce();
  });
});

describe("segunda etapa nunca lembra o aparelho", () => {
  for (const path of ["/two-factor/verify-totp", "/two-factor/verify-backup-code"]) {
    it(`${path} recusa trustDevice verdadeiro com 400`, async () => {
      const gate = deps();
      const response = await guardAuthRequest(
        post(path, { code: "123456", trustDevice: true }),
        gate,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "TRUST_DEVICE_NOT_ALLOWED" });
      expect(gate.handler).not.toHaveBeenCalled();
    });
  }

  it("recusa também o pedido em formulário", async () => {
    const gate = deps();
    const response = await guardAuthRequest(
      post(
        "/two-factor/verify-totp",
        "code=123456&trustDevice=true",
        "application/x-www-form-urlencoded",
      ),
      gate,
    );
    expect(response.status).toBe(400);
    expect(gate.handler).not.toHaveBeenCalled();
  });

  it("deixa passar o código sem trustDevice ou com trustDevice falso", async () => {
    const gate = deps();
    await guardAuthRequest(post("/two-factor/verify-totp", { code: "123456" }), gate);
    await guardAuthRequest(
      post("/two-factor/verify-totp", { code: "123456", trustDevice: false }),
      gate,
    );
    expect(gate.handler).toHaveBeenCalledTimes(2);
  });

  it("entrega ao Better Auth o corpo intacto", async () => {
    const handler = vi.fn(async (_request: Request) => Response.json({ ok: true }));
    await guardAuthRequest(post("/two-factor/verify-totp", { code: "654321" }), deps({ handler }));
    const forwarded = handler.mock.calls[0]?.[0];
    expect(await forwarded?.json()).toEqual({ code: "654321" });
  });
});

describe("ativação só com a prova por e-mail da sessão", () => {
  it("recusa com 403 quando a sessão não tem prova válida", async () => {
    const gate = deps({ takeProof: vi.fn(async () => null) });
    const response = await guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_CODE_REQUIRED" });
    expect(gate.handler).not.toHaveBeenCalled();
    expect(gate.takeProof).toHaveBeenCalledWith("sessao-1");
  });

  it("recusa com 401 sem sessão", async () => {
    const gate = deps({ currentSession: vi.fn(async () => null) });
    const response = await guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate);
    expect(response.status).toBe(401);
    expect(gate.takeProof).not.toHaveBeenCalled();
    expect(gate.handler).not.toHaveBeenCalled();
  });

  it("consome a prova quando a ativação dá certo", async () => {
    const gate = deps();
    const response = await guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate);
    expect(response.status).toBe(200);
    expect(gate.handler).toHaveBeenCalledOnce();
    expect(gate.restoreProof).not.toHaveBeenCalled();
  });

  it("devolve a prova quando a senha não confere", async () => {
    const expiresAt = new Date("2026-10-17T12:10:00Z");
    const gate = deps({
      handler: vi.fn(async () => Response.json({ code: "INVALID_PASSWORD" }, { status: 400 })),
      takeProof: vi.fn(async () => ({ expiresAt })),
    });
    const response = await guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate);
    expect(response.status).toBe(400);
    expect(gate.restoreProof).toHaveBeenCalledWith("sessao-1", "u1", expiresAt);
  });

  it("devolve a prova e repassa o erro quando o Better Auth quebra", async () => {
    const gate = deps({
      handler: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    await expect(
      guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate),
    ).rejects.toThrow("database unavailable");
    expect(gate.restoreProof).toHaveBeenCalledOnce();
  });

  it("uma prova só serve a uma ativação, mesmo com dois pedidos ao mesmo tempo", async () => {
    let available = true;
    const gate = deps({
      takeProof: vi.fn(async () => {
        if (!available) return null;
        available = false;
        return { expiresAt: new Date() };
      }),
    });
    const [first, second] = await Promise.all([
      guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate),
      guardAuthRequest(post("/two-factor/enable", { password: "x" }), gate),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 403]);
    expect(gate.handler).toHaveBeenCalledOnce();
  });
});
