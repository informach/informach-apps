import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { type DesktopAppId, leaseClaimsSchema } from "@informach/edi-contracts";
import { describe, expect, it } from "vitest";
import type { DesktopStatus } from "./contracts";
import { createDesktopController } from "./controller";
import { createDesktopJobs } from "./jobs";
import type { Vault, VaultData } from "./vault";
import { vaultSchema } from "./vault";

const keys = generateKeyPairSync("ed25519");
const issuer = "http://localhost:3006";
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
function fixture(
  options: {
    data?: VaultData;
    appId?: DesktopAppId;
    clientVersion?: string;
    minimumClientVersion?: string;
    changed?: (status: DesktopStatus) => void;
  } = {},
) {
  let time = Date.parse("2026-10-16T12:00:00Z");
  const data: VaultData = options.data ?? {
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
    mcpGrants: {},
    boundUserId: "user",
    updateFloors: {},
  };
  const vault: Vault = { use: async (operation) => operation(data) };
  let mode:
    | "granted"
    | "denied"
    | "revoked"
    | "update-required"
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
    if (mode === "revoked")
      return Response.json({ status: "denied", reason: "device_revoked", serverTime: time });
    if (mode === "denied" || mode === "update-required")
      return Response.json({
        status: "denied",
        reason: mode === "update-required" ? "update_required" : "subscription_required",
        serverTime: time,
      });
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
      minimumClientVersion: options.minimumClientVersion ?? "0.1.0",
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
    appId: options.appId ?? "edifoto",
    clientVersion: options.clientVersion ?? "0.1.0",
    vault,
    fetch: transport,
    now: () => time,
    changed: options.changed ?? (() => {}),
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
  it("isolates an outdated app without revoking a current app or interrupting its recording", async () => {
    let jobs: ReturnType<typeof createDesktopJobs> | undefined;
    const current = fixture({
      clientVersion: "0.2.0",
      changed: (status) => jobs?.setAccess(status.state === "licensed"),
    });
    const old = fixture({ data: current.data, appId: "ediaula" });
    jobs = createDesktopJobs({
      assertAccess: () => current.controller.assertAccess(),
      onStopError: () => {},
    });
    await current.controller.refresh();
    const lease = current.data.leases.edifoto;
    let stopped = false;
    const recording = jobs.begin({
      preserveForMs: 0,
      stop: () => {
        stopped = true;
      },
    });
    try {
      old.mode("update-required");
      await old.controller.refresh();
      expect(() => old.controller.assertAccess()).toThrow("edi_access_restricted");
      expect(current.data.session).not.toBeNull();
      await current.controller.synchronize();
      expect(current.controller.status().state).toBe("licensed");
      expect(current.data.leases.edifoto).toBe(lease);
      recording.check();
      expect(stopped).toBe(false);

      // Persist/reload the cofre so denial cannot be bypassed by restarting
      // while the shared lease was issued before the minimum was raised.
      const restored = fixture({
        data: vaultSchema.parse(JSON.parse(JSON.stringify(current.data))),
        appId: "ediaula",
      });
      restored.mode("offline");
      await restored.controller.refresh();
      expect(() => restored.controller.assertAccess()).toThrow("edi_access_restricted");
      expect(restored.data.leases.edifoto).toBe(lease);

      old.mode("offline");
      await old.controller.refresh();
      await old.controller.synchronize();
      await current.controller.synchronize();
      expect(old.controller.status().state).toBe("restricted");
      expect(current.controller.status().state).toBe("licensed");
      recording.check();
      expect(stopped).toBe(false);

      const upgraded = fixture({
        data: current.data,
        appId: "ediaula",
        clientVersion: "0.2.0",
        minimumClientVersion: "0.2.0",
      });
      await upgraded.controller.refresh();
      expect(upgraded.controller.status().state).toBe("licensed");
      expect(current.data.licenseVersionDeniedThrough).toBeUndefined();
      old.mode("offline");
      await old.controller.refresh();
      await current.controller.synchronize();
      expect(old.controller.status().state).toBe("restricted");
      expect(current.controller.status().state).toBe("licensed");

      // A financially denied lease is still global and stops the other app.
      old.mode("denied");
      await old.controller.refresh();
      await current.controller.synchronize();
      expect(current.controller.status().state).toBe("restricted");
      expect(stopped).toBe(true);
    } finally {
      recording.finish();
      jobs.dispose();
    }
  });

  it("keeps the new signed lease when an outdated app is offline", async () => {
    const current = fixture({ clientVersion: "0.2.0", minimumClientVersion: "0.2.0" });
    await current.controller.refresh();
    const old = fixture({ data: current.data, appId: "ediaula" });
    old.mode("offline");
    await old.controller.refresh();
    await current.controller.synchronize();
    expect(old.controller.status().state).toBe("restricted");
    expect(current.controller.status().state).toBe("licensed");
  });

  it("still invalidates the shared lease on clock rollback when its version also requires an update", async () => {
    const current = fixture({ clientVersion: "0.2.0", minimumClientVersion: "0.2.0" });
    await current.controller.refresh();
    const old = fixture({ data: current.data, appId: "ediaula" });
    old.mode("offline");
    old.advance(-120000);
    await old.controller.refresh();
    await current.controller.synchronize();
    expect(Object.keys(current.data.leases)).toHaveLength(0);
    expect(current.controller.status().state).toBe("restricted");
  });
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
    expect(f.controller.status().reason).toBe(
      "Esta conta não tem uma assinatura ativa. Assine em Minha assinatura para abrir as ferramentas.",
    );
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
  it("signing out removes every local AI connection with the session", async () => {
    const f = fixture();
    await f.controller.refresh();
    f.data.mcpGrants = {
      ediaula: [
        {
          id: randomUUID(),
          client: "claude-code",
          tokenHash: "b".repeat(64),
          scopes: ["read", "propose"],
          createdAt: 1,
        },
      ],
    };
    f.data.mcpTokens = { edifoto: "c".repeat(64) };
    await f.controller.logout();
    expect(f.data.session).toBeNull();
    expect(f.data.mcpGrants).toEqual({});
    expect(f.data.mcpTokens).toEqual({});
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
describe("restricted status cause", () => {
  it("names account denials and keeps userId only while a session is kept", async () => {
    const f = fixture();
    f.mode("denied");
    await f.controller.refresh();
    expect(f.controller.status()).toMatchObject({
      state: "restricted",
      cause: "subscription_required",
      userId: "user",
    });
    f.mode("revoked");
    await f.controller.refresh();
    expect(f.data.session).toBeNull();
    expect(f.controller.status()).toMatchObject({ cause: "device_revoked", userId: null });
    await f.controller.refresh();
    expect(f.controller.status()).toMatchObject({ cause: "signed_out", userId: null });
  });
  it("tells offline, expired, update and revalidation apart from account problems", async () => {
    const offline = fixture();
    offline.mode("offline");
    await offline.controller.refresh();
    expect(offline.controller.status()).toMatchObject({ cause: "offline", userId: "user" });

    const expired = fixture();
    await expired.controller.refresh();
    expect(expired.controller.status()).toMatchObject({ state: "licensed", cause: null });
    expired.advance(3600 * 1000 + 1);
    expired.controller.expire();
    expect(expired.controller.status()).toMatchObject({ state: "restricted", cause: "expired" });

    const update = fixture();
    update.mode("update-required");
    await update.controller.refresh();
    expect(update.controller.status()).toMatchObject({ cause: "update_required", userId: "user" });

    const rejected = fixture();
    rejected.mode("401-html");
    await rejected.controller.refresh();
    expect(rejected.controller.status()).toMatchObject({ cause: "revalidate", userId: null });
  });
});
