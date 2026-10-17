import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { leaseClaimsSchema } from "@informach/edi-contracts";
import { describe, expect, it } from "vitest";
import { createDesktopController } from "./controller";
import type { Vault, VaultData } from "./vault";

const keys = generateKeyPairSync("ed25519");
const issuer = "http://localhost:3006";
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
function fixture() {
  let time = Date.parse("2026-10-16T12:00:00Z");
  const data: VaultData = {
    version: 1,
    deviceId: randomUUID(),
    privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeySpki: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    keyThumbprint: "a".repeat(64),
    session: {
      userId: "user",
      activationId: randomUUID(),
      sessionId: randomUUID(),
      keyThumbprint: "a".repeat(64),
      accessToken: "access",
      refreshToken: "refresh",
      accessExpiresAt: time + 300000,
      sessionExpiresAt: new Date(time + 30 * 86400000).toISOString(),
    },
    leases: {},
    lastTrustedTime: 0,
    mcpTokens: {},
    boundUserId: "user",
    updateFloors: {},
  };
  const vault: Vault = { use: async (operation) => operation(data) };
  let mode:
    | "granted"
    | "denied"
    | "offline"
    | "503"
    | "503-html"
    | "401-html"
    | "forged"
    | "oversized"
    | "malformed-json"
    | "malformed-utf8"
    | "stream-failure" = "granted";
  const transport: typeof fetch = async () => {
    if (mode === "offline") throw new TypeError("Network unavailable");
    if (mode === "503") return Response.json({ error: "unavailable" }, { status: 503 });
    if (mode === "503-html" || mode === "401-html")
      return new Response("<html>Proxy response</html>", {
        status: mode === "503-html" ? 503 : 401,
      });
    if (mode === "oversized") return new Response(" ".repeat(64 * 1024 + 1));
    if (mode === "malformed-json") return new Response("{");
    if (mode === "malformed-utf8")
      return new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]));
    if (mode === "stream-failure")
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new TypeError("Network interrupted"));
          },
        }),
      );
    if (mode === "denied")
      return Response.json({ status: "denied", reason: "subscription_required", serverTime: time });
    const session = data.session;
    if (!session) throw new Error("Session required for fixture");
    const now = Math.floor(time / 1000);
    const claims = leaseClaimsSchema.parse({
      version: 1,
      iss: issuer,
      aud: "edi-desktop",
      environment: "development",
      sub: session.userId,
      deviceId: data.deviceId,
      keyThumbprint: data.keyThumbprint,
      activationId: session.activationId,
      revision: 0,
      tools: ["ediaula", "edifoto"],
      iat: now,
      nbf: now,
      exp: now + 3600,
      paidThrough: now + 86400,
      jti: randomUUID(),
    });
    const header = Buffer.from(
      JSON.stringify({ alg: "EdDSA", typ: "edi-license+jwt", kid: "test" }),
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signingKey =
      mode === "forged" ? generateKeyPairSync("ed25519").privateKey : keys.privateKey;
    const lease = `${header}.${body}.${sign(null, Buffer.from(`${header}.${body}`), signingKey).toString("base64url")}`;
    return Response.json({ status: "granted", lease, serverTime: time });
  };
  const controller = createDesktopController({
    portalUrl: issuer,
    clientId: "test",
    environment: "development",
    publisher: "",
    downloadHost: "",
    trustedKeys: { test: publicPem },
    appId: "edifoto",
    vault,
    fetch: transport,
    now: () => time,
    changed: () => {},
    openExternal: async () => {},
  });
  return {
    controller,
    data,
    mode: (value: typeof mode) => {
      mode = value;
    },
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}
describe("native subscription authorization", () => {
  it("validates a signed lease and supports an unexpired offline lease", async () => {
    const f = fixture();
    await f.controller.refresh();
    expect(f.controller.status().state).toBe("licensed");
    f.mode("offline");
    await f.controller.refresh();
    expect(f.controller.status().offline).toBe(true);
    expect(() => f.controller.assertAccess()).not.toThrow();
  });
  it("uses cached access on service unavailability but never after explicit denial", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.mode("503");
    await f.controller.refresh();
    expect(f.controller.status().state).toBe("licensed");
    f.mode("denied");
    await f.controller.refresh();
    expect(f.data.leases).toEqual({});
    f.mode("offline");
    await f.controller.refresh();
    expect(() => f.controller.assertAccess()).toThrow("edi_access_restricted");
  });
  it("rejects forged licenses instead of accepting an older cached one", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.mode("forged");
    await f.controller.refresh();
    expect(f.controller.status().state).toBe("restricted");
    expect(f.data.session).toBeNull();
  });
  it("keeps only an unexpired lease during an HTML proxy outage or interrupted response stream", async () => {
    for (const mode of ["503-html", "stream-failure"] satisfies Parameters<
      ReturnType<typeof fixture>["mode"]
    >[0][]) {
      const f = fixture();
      await f.controller.refresh();
      f.mode(mode);
      await f.controller.refresh();
      expect(f.controller.status().state).toBe("licensed");
      expect(f.controller.status().offline).toBe(true);
      f.advance(3600000);
      await f.controller.refresh();
      expect(f.controller.status().state).toBe("restricted");
    }
  });
  it("clears a denied session even when HTTP 401 has no JSON error body", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.mode("401-html");
    await f.controller.refresh();
    expect(f.controller.status().state).toBe("restricted");
    expect(f.data.session).toBeNull();
    expect(f.data.leases).toEqual({});
  });
  it("rejects oversized, malformed JSON and invalid UTF-8 instead of using an older cached lease", async () => {
    for (const mode of ["oversized", "malformed-json", "malformed-utf8"] satisfies Parameters<
      ReturnType<typeof fixture>["mode"]
    >[0][]) {
      const f = fixture();
      await f.controller.refresh();
      f.mode(mode);
      await f.controller.refresh();
      expect(f.controller.status().state).toBe("restricted");
      expect(f.data.leases).toEqual({});
    }
  });
  it("expires offline access without extending the lease", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.advance(3600000);
    f.mode("offline");
    await f.controller.refresh();
    expect(f.controller.status().state).toBe("restricted");
  });
  it("rejects a backwards clock at the command boundary", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.controller.assertAccess();
    f.advance(-120000);
    expect(() => f.controller.assertAccess()).toThrow("edi_clock_rollback");
  });
  it("observes shared logout without another network request", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.data.session = null;
    f.data.leases = {};
    await f.controller.synchronize();
    expect(f.controller.status().state).toBe("restricted");
    expect(f.controller.status().userId).toBeNull();
  });
});
