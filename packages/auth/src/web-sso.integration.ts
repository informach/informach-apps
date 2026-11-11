import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { db } from "@informach/db";
import {
  oauthClients,
  sessions,
  ssoAccessTokens,
  ssoClients,
  twoFactors,
  users,
  verifications,
  webTwoFactors,
} from "@informach/db/schema";
import { toNodeHandler } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type CreateAuthConfig, createAuth } from "./index";
import { postgresAuthRateLimit } from "./postgres-auth-rate-limit";
import { freezeWebParticipation, resumeWebParticipation } from "./web-participation";
import {
  isRecentWebAuthentication,
  listWebSessions,
  revokeWebBrowserFromClient,
  revokeWebSessions,
} from "./web-sessions";
import { provisionWebSso, webSsoClient, webSsoOrigin } from "./web-sso";

const environment = "development";
const centralOrigin = webSsoOrigin("conta", environment);
const client = webSsoClient("cozya", environment);
const emailCodes = new Map<string, string>();
const baseConfig = (baseUrl: string): CreateAuthConfig => ({
  appName: "SSO integration",
  baseUrl,
  secret: randomBytes(32).toString("hex"),
  trustedOrigins: [baseUrl],
  email: { verification: "link", signIn: { magicLink: false } },
  sendEmail: async () => ({ ok: true, status: "sent", deliveryId: randomUUID() }),
  renderTemplate: async (template, data) => {
    if ("otp" in data && typeof data.otp === "string") emailCodes.set(template, data.otp);
    return {
      html: "<p>Integration</p>",
      text: "Integration",
      subject: "Integration",
    };
  },
  buildUnsubscribeUrl: () => `${baseUrl}/unsubscribe`,
  rateLimitRules: {
    "/sign-in/social": { window: 60, max: 100 },
    "/sign-in/email": { window: 60, max: 100 },
    "/sign-up/email": { window: 60, max: 100 },
    "/two-factor/*": { window: 60, max: 100 },
  },
});
let central: ReturnType<typeof createAuth>["auth"];
let relying: ReturnType<typeof createAuth>["auth"];
const server = createServer((req, res) => toNodeHandler(central)(req, res));
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
async function request(
  auth: typeof central,
  origin: string,
  path: string,
  body?: Record<string, unknown>,
  cookie = "",
) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
async function account() {
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  const signup = await request(central, centralOrigin, "/sign-up/email", {
    email,
    password,
    name: "SSO test",
  });
  expect(signup.status, await signup.clone().text()).toBe(200);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning();
  if (!user) throw new Error("Test identity was not created");
  const login = await request(central, centralOrigin, "/sign-in/email", { email, password });
  expect(login.status, await login.clone().text()).toBe(200);
  return { user, password, cookie: cookies(login) };
}
async function authorize(centralCookie: string) {
  const start = await request(relying, client.origin, "/sign-in/social", {
    provider: client.providerId,
    callbackURL: `${client.origin}/inicio`,
    disableRedirect: true,
  });
  expect(start.status, await start.clone().text()).toBe(200);
  const { url } = await start.json();
  const authorization = new URL(url);
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorization.searchParams.get("nonce")).toBeTruthy();
  const approved = await central.handler(new Request(url, { headers: { Cookie: centralCookie } }));
  expect(approved.status, await approved.clone().text()).toBe(302);
  const callback = approved.headers.get("location");
  if (!callback) throw new Error("Missing registered callback");
  expect(new URL(callback).searchParams.get("code"), callback).toBeTruthy();
  return { callback, stateCookie: cookies(start) };
}
async function complete(flow: Awaited<ReturnType<typeof authorize>>, cookie = flow.stateCookie) {
  return relying.handler(new Request(flow.callback, { headers: { Cookie: cookie } }));
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(url.hostname)
  )
    throw new Error("Disposable PostgreSQL runner required");
  central = createAuth({
    ...baseConfig(centralOrigin),
    secret: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
    webSso: { role: "provider", environment },
    twoFactor: { enabled: true },
    email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
  }).auth;
  await provisionWebSso(db, environment);
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(Number(new URL(centralOrigin).port), "localhost", done);
  });
  relying = createAuth({
    ...baseConfig(client.origin),
    webSso: { role: "client", environment, app: "cozya" },
  }).auth;
  await relying.$context;
});
afterAll(async () => {
  if (server.listening)
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
});

describe("real central OIDC and relying app", () => {
  it("keeps central recovery available but refuses app login while web participation is frozen", async () => {
    const owner = await account();
    const signedIn = await complete(await authorize(owner.cookie));
    const appCookie = cookies(signedIn);
    expect(
      await db
        .select({ id: ssoAccessTokens.id })
        .from(ssoAccessTokens)
        .where(eq(ssoAccessTokens.userId, owner.user.id)),
    ).not.toHaveLength(0);
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, {
        userId: owner.user.id,
        operationId,
        expectedRevision: 0,
      }),
    );
    expect(
      await db
        .select({ id: ssoAccessTokens.id })
        .from(ssoAccessTokens)
        .where(eq(ssoAccessTokens.userId, owner.user.id)),
    ).toHaveLength(0);
    expect(
      await (await request(relying, client.origin, "/get-session", undefined, appCookie)).json(),
    ).toBeNull();
    const recovery = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    expect(recovery.status).toBe(200);
    const recoveryCookie = cookies(recovery);
    expect(
      (
        await (
          await request(central, centralOrigin, "/get-session", undefined, recoveryCookie)
        ).json()
      ).user.id,
    ).toBe(owner.user.id);
    const refused = await complete(await authorize(recoveryCookie));
    expect(cookies(refused)).not.toContain("informach-cozya.session_token=");
    await db.transaction((tx) =>
      resumeWebParticipation(tx, {
        userId: owner.user.id,
        operationId,
        expectedRevision: 1,
      }),
    );
    expect(
      await (
        await request(central, centralOrigin, "/get-session", undefined, recoveryCookie)
      ).json(),
    ).toBeNull();
    const login = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    expect(cookies(await complete(await authorize(cookies(login))))).toContain(
      "informach-cozya.session_token=",
    );
  });

  it("does not treat a fresh app callback as fresh password authentication; prompt=login requires central sign-in", async () => {
    const owner = await account();
    const root = await (
      await request(central, centralOrigin, "/get-session", undefined, owner.cookie)
    ).json();
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 3600_000) })
      .where(eq(sessions.id, root.session.id));
    const signedIn = await complete(await authorize(owner.cookie));
    const appSession = await (
      await request(relying, client.origin, "/get-session", undefined, cookies(signedIn))
    ).json();
    expect(Date.now() - new Date(appSession.session.createdAt).getTime()).toBeLessThan(60_000);
    expect(
      await isRecentWebAuthentication({
        userId: owner.user.id,
        sessionId: appSession.session.id,
        app: "cozya",
        maxAgeSeconds: 600,
      }),
    ).toBe(false);
    const start = await request(relying, client.origin, "/sign-in/social", {
      provider: client.providerId,
      callbackURL: `${client.origin}/inicio`,
      disableRedirect: true,
      additionalParams: { prompt: "login" },
    });
    expect(start.status, await start.clone().text()).toBe(200);
    const { url } = await start.json();
    const prompted = await central.handler(new Request(url, { headers: { Cookie: owner.cookie } }));
    const promptUrl = new URL(prompted.headers.get("location") ?? centralOrigin, centralOrigin);
    expect(promptUrl.pathname).toBe("/entrar");
    expect(promptUrl.searchParams.get("sig")).toBeTruthy();
    const login = await request(
      central,
      centralOrigin,
      "/sign-in/email",
      {
        email: owner.user.email,
        password: owner.password,
        oauth_query: promptUrl.searchParams.toString(),
      },
      owner.cookie,
    );
    expect(login.status, await login.clone().text()).toBe(200);
    const resumed = await complete({
      callback: (await login.json()).url,
      stateCookie: cookies(start),
    });
    const fresh = await (
      await request(relying, client.origin, "/get-session", undefined, cookies(resumed))
    ).json();
    expect(
      await isRecentWebAuthentication({
        userId: owner.user.id,
        sessionId: fresh.session.id,
        app: "cozya",
        maxAgeSeconds: 600,
      }),
    ).toBe(true);
    expect(
      await isRecentWebAuthentication({
        userId: owner.user.id,
        sessionId: fresh.session.id,
        app: "missao-saber",
        maxAgeSeconds: 600,
      }),
    ).toBe(false);
  });

  it("app sign-out closes this browser's central session and descendants, preserving another browser", async () => {
    const owner = await account();
    const otherBrowser = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    const appCookie = cookies(await complete(await authorize(owner.cookie)));
    const anotherChildCookie = cookies(await complete(await authorize(owner.cookie)));
    const signedOut = await request(relying, client.origin, "/sign-out", {}, appCookie);
    expect(signedOut.status, await signedOut.clone().text()).toBe(200);
    expect(
      await (await request(central, centralOrigin, "/get-session", undefined, owner.cookie)).json(),
    ).toBeNull();
    expect(
      await (
        await request(relying, client.origin, "/get-session", undefined, anotherChildCookie)
      ).json(),
    ).toBeNull();
    expect(
      (
        await (
          await request(central, centralOrigin, "/get-session", undefined, cookies(otherBrowser))
        ).json()
      ).user.id,
    ).toBe(owner.user.id);
  });

  it("retires the previous browser only after valid credentials, including an account switch", async () => {
    const owner = await account();
    const other = await account();
    const appCookie = cookies(await complete(await authorize(owner.cookie)));
    const rejected = await request(
      central,
      centralOrigin,
      "/sign-in/email",
      {
        email: other.user.email,
        password: "incorrect-password",
      },
      owner.cookie,
    );
    expect(rejected.ok).toBe(false);
    expect(
      (await (await request(relying, client.origin, "/get-session", undefined, appCookie)).json())
        .user.id,
    ).toBe(owner.user.id);
    const replaced = await request(
      central,
      centralOrigin,
      "/sign-in/email",
      {
        email: other.user.email,
        password: other.password,
      },
      owner.cookie,
    );
    expect(replaced.ok).toBe(true);
    expect(
      await (await request(relying, client.origin, "/get-session", undefined, appCookie)).json(),
    ).toBeNull();
    expect(
      await (await request(central, centralOrigin, "/get-session", undefined, owner.cookie)).json(),
    ).toBeNull();
    expect(
      (
        await (
          await request(central, centralOrigin, "/get-session", undefined, other.cookie)
        ).json()
      ).user.id,
    ).toBe(other.user.id);
    expect(
      (
        await (
          await request(central, centralOrigin, "/get-session", undefined, cookies(replaced))
        ).json()
      ).user.id,
    ).toBe(other.user.id);
  });

  it.each(["unverified", "banned"])(
    "can close a browser even after the account becomes %s",
    async (state) => {
      const owner = await account();
      const appCookie = cookies(await complete(await authorize(owner.cookie)));
      const identity = await (
        await request(relying, client.origin, "/get-session", undefined, appCookie)
      ).json();
      await db
        .update(users)
        .set(state === "banned" ? { banned: true } : { emailVerified: false })
        .where(eq(users.id, owner.user.id));
      expect(
        await isRecentWebAuthentication({
          userId: owner.user.id,
          sessionId: identity.session.id,
          app: "cozya",
          maxAgeSeconds: 600,
        }),
      ).toBe(false);
      await revokeWebBrowserFromClient(owner.user.id, identity.session.id, "cozya");
      expect(
        await db.select().from(sessions).where(eq(sessions.userId, owner.user.id)),
      ).toHaveLength(0);
    },
  );

  it("cascades selected browser revocations, isolates other accounts and never returns credentials", async () => {
    const owner = await account();
    const other = await account();
    const first = await (
      await request(central, centralOrigin, "/get-session", undefined, owner.cookie)
    ).json();
    const unrelated = await (
      await request(central, centralOrigin, "/get-session", undefined, other.cookie)
    ).json();
    const second = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    const secondIdentity = await (
      await request(central, centralOrigin, "/get-session", undefined, cookies(second))
    ).json();
    const opened = await complete(await authorize(owner.cookie));
    const snapshot = await listWebSessions(owner.user.id, first.session.id);
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions.find((row) => row.current)?.apps).toEqual(["cozya"]);
    expect(JSON.stringify(snapshot)).not.toContain(first.session.token);
    expect(JSON.stringify(snapshot)).not.toContain("userAgent");
    expect(
      (await request(central, centralOrigin, "/list-sessions", undefined, owner.cookie)).status,
    ).toBe(403);
    expect(
      (await request(central, centralOrigin, "/revoke-sessions", {}, owner.cookie)).status,
    ).toBe(403);
    await expect(listWebSessions(other.user.id, first.session.id)).rejects.toThrow();
    await revokeWebSessions(owner.user.id, first.session.id, {
      mode: "one",
      sessionId: unrelated.session.id,
    });
    expect(
      (await request(central, centralOrigin, "/get-session", undefined, other.cookie)).status,
    ).toBe(200);
    await revokeWebSessions(owner.user.id, secondIdentity.session.id, { mode: "others" });
    expect(
      await (await request(central, centralOrigin, "/get-session", undefined, owner.cookie)).json(),
    ).toBeNull();
    expect(
      await (
        await request(relying, client.origin, "/get-session", undefined, cookies(opened))
      ).json(),
    ).toBeNull();
    expect((await listWebSessions(owner.user.id, secondIdentity.session.id)).sessions).toHaveLength(
      1,
    );
    const revoked = await revokeWebSessions(owner.user.id, secondIdentity.session.id, {
      mode: "all",
    });
    expect(revoked.currentRevoked).toBe(true);
    await expect(listWebSessions(owner.user.id, secondIdentity.session.id)).rejects.toThrow();
  });

  it("refuses a valid already-issued ID token after its parent session is revoked", async () => {
    const owner = await account();
    const flow = await authorize(owner.cookie);
    const originalFetch = globalThis.fetch;
    const issued = gate();
    const release = gate();
    const intercepted = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${centralOrigin}/api/auth/oauth2/token`) {
        const data = await response.clone().json();
        expect(data.id_token).toBeTruthy();
        issued.resolve();
        await release.promise;
      }
      return response;
    });
    const completing = complete(flow);
    try {
      await Promise.race([
        issued.promise,
        completing.then(() => {
          throw new Error("Token response was not intercepted");
        }),
      ]);
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, owner.user.id), eq(sessions.originApp, "conta")));
      release.resolve();
      expect(cookies(await completing)).not.toContain("informach-cozya.session_token=");
      expect(
        await db.select().from(sessions).where(eq(sessions.userId, owner.user.id)),
      ).toHaveLength(0);
    } finally {
      release.resolve();
      intercepted.mockRestore();
      await completing;
    }
  });
  it("isolates the central authenticator from Bastidores and completes OIDC only after the second factor", async () => {
    const owner = await account();
    // Existing administrative factor belongs to another issuer/secret.
    await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, owner.user.id));
    const administrativeFactor = {
      id: randomUUID(),
      userId: owner.user.id,
      secret: "unrelated-admin-ciphertext",
      backupCodes: "unrelated-admin-backups",
      verified: true,
    };
    await db.insert(twoFactors).values(administrativeFactor);
    const ordinaryLogin = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    expect((await ordinaryLogin.clone().json()).twoFactorRedirect).toBeUndefined();
    const setup = await request(
      central,
      centralOrigin,
      "/two-factor/enable",
      { password: owner.password },
      owner.cookie,
    );
    expect(setup.status, await setup.clone().text()).toBe(200);
    const { totpURI, backupCodes } = await setup.json();
    const verified = await request(
      central,
      centralOrigin,
      "/two-factor/verify-totp",
      { code: totpCode(totpURI) },
      owner.cookie,
    );
    expect(verified.status, await verified.clone().text()).toBe(200);
    const [identity] = await db.select().from(users).where(eq(users.id, owner.user.id));
    expect(identity).toMatchObject({ twoFactorEnabled: true, webTwoFactorEnabled: true });
    expect(
      await db.select().from(twoFactors).where(eq(twoFactors.userId, owner.user.id)),
    ).toMatchObject([administrativeFactor]);
    const [factor] = await db
      .select()
      .from(webTwoFactors)
      .where(eq(webTwoFactors.userId, owner.user.id));
    expect(factor?.verified).toBe(true);
    expect(factor?.backupCodes).not.toContain(backupCodes[0]);
    expect(
      await (
        await request(central, centralOrigin, "/get-session", undefined, cookies(ordinaryLogin))
      ).json(),
    ).toBeNull();

    const start = await request(relying, client.origin, "/sign-in/social", {
      provider: client.providerId,
      callbackURL: `${client.origin}/inicio`,
      disableRedirect: true,
    });
    const prompt = await central.handler(new Request((await start.json()).url));
    const loginUrl = new URL(prompt.headers.get("location") ?? centralOrigin, centralOrigin);
    const oauth_query = loginUrl.searchParams.toString();
    const passwordOnly = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
      oauth_query,
    });
    expect(await passwordOnly.json()).toMatchObject({ twoFactorRedirect: true });
    expect(
      await (
        await request(central, centralOrigin, "/get-session", undefined, cookies(passwordOnly))
      ).json(),
    ).toBeNull();
    const secondFactor = await request(
      central,
      centralOrigin,
      "/two-factor/verify-totp",
      { code: totpCode(totpURI), oauth_query },
      cookies(passwordOnly),
    );
    expect(secondFactor.status, await secondFactor.clone().text()).toBe(200);
    const result = await secondFactor.json();
    expect(result.redirect).toBe(true);
    const completed = await complete({ callback: result.url, stateCookie: cookies(start) });
    expect(
      (
        await (
          await request(relying, client.origin, "/get-session", undefined, cookies(completed))
        ).json()
      ).user.id,
    ).toBe(owner.user.id);

    // Verifying an email is not an alternate sign-in that skips TOTP.
    const emailRequest = await request(central, centralOrigin, "/email-otp/send-verification-otp", {
      email: owner.user.email,
      type: "email-verification",
    });
    expect(emailRequest.status).toBe(200);
    const emailVerified = await request(central, centralOrigin, "/email-otp/verify-email", {
      email: owner.user.email,
      otp: emailCodes.get("auth.verify-email-otp"),
    });
    expect(emailVerified.status, await emailVerified.clone().text()).toBe(200);
    expect((await emailVerified.json()).token).toBeNull();
    expect(
      (
        await request(central, centralOrigin, "/sign-in/email-otp", {
          email: owner.user.email,
          otp: "123456",
        })
      ).status,
    ).toBe(403);
    expect(
      await (
        await request(central, centralOrigin, "/get-session", undefined, cookies(emailVerified))
      ).json(),
    ).toBeNull();

    const challenges = await Promise.all(
      [0, 1].map(() =>
        request(central, centralOrigin, "/sign-in/email", {
          email: owner.user.email,
          password: owner.password,
        }),
      ),
    );
    const recoveries = await Promise.all(
      challenges.map((challenge) =>
        request(
          central,
          centralOrigin,
          "/two-factor/verify-backup-code",
          { code: backupCodes[0] },
          cookies(challenge),
        ),
      ),
    );
    expect(recoveries.filter((response) => response.status === 200)).toHaveLength(1);
    expect(recoveries.filter((response) => response.status !== 200)).toHaveLength(1);
    const recovered = recoveries.find((response) => response.status === 200);
    if (!recovered) throw new Error("Missing recovered session");
    const disabled = await request(
      central,
      centralOrigin,
      "/two-factor/disable",
      { password: owner.password },
      cookies(recovered),
    );
    expect(disabled.status, await disabled.clone().text()).toBe(200);
    expect(
      await db.select().from(webTwoFactors).where(eq(webTwoFactors.userId, owner.user.id)),
    ).toHaveLength(0);
    expect((await db.select().from(users).where(eq(users.id, owner.user.id)))[0]).toMatchObject({
      twoFactorEnabled: true,
      webTwoFactorEnabled: false,
    });
    expect(
      await db.select().from(twoFactors).where(eq(twoFactors.userId, owner.user.id)),
    ).toMatchObject([administrativeFactor]);
  });
  it("limits concurrent attempts atomically without consuming another app's budget", async () => {
    const key = randomUUID();
    const centralLimit = postgresAuthRateLimit(db, "conta");
    const appLimit = postgresAuthRateLimit(db, "cozya");
    if (!centralLimit.consume || !appLimit.consume) throw new Error("Atomic limiter required");
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => centralLimit.consume?.(key, { max: 4, window: 60 })),
    );
    expect(attempts.filter((result) => result?.allowed)).toHaveLength(4);
    expect((await appLimit.consume(key, { max: 4, window: 60 })).allowed).toBe(true);
  });
  it("exposes one central recovery endpoint without alternate rate-limit budgets", async () => {
    const email = `${randomUUID()}@example.test`;
    expect(
      (await request(central, centralOrigin, "/forget-password/email-otp", { email })).status,
    ).toBe(403);
    expect(
      (
        await request(central, centralOrigin, "/email-otp/send-verification-otp", {
          email,
          type: "forget-password",
        })
      ).status,
    ).toBe(403);
    for (let attempt = 0; attempt < 3; attempt++)
      expect(
        (await request(central, centralOrigin, "/email-otp/request-password-reset", { email }))
          .status,
      ).toBe(200);
    expect(
      (await request(central, centralOrigin, "/email-otp/request-password-reset", { email }))
        .status,
    ).toBe(429);
  });

  it("bounds attempts by a fixed window without extending the window with each allowed request", async () => {
    const limiter = postgresAuthRateLimit(db, "conta");
    if (!limiter.consume) throw new Error("Atomic limiter required");
    const base = Date.now();
    const clock = vi.spyOn(Date, "now");
    try {
      const steadyKey = randomUUID();
      for (let step = 0; step < 10; step++) {
        clock.mockReturnValue(base + step * 20_000);
        expect((await limiter.consume(steadyKey, { max: 4, window: 60 })).allowed).toBe(true);
      }
      const burstKey = randomUUID();
      for (let step = 0; step < 4; step++) {
        clock.mockReturnValue(base + step * 10_000);
        expect((await limiter.consume(burstKey, { max: 4, window: 60 })).allowed).toBe(true);
      }
      clock.mockReturnValue(base + 59_000);
      expect(await limiter.consume(burstKey, { max: 4, window: 60 })).toEqual({
        allowed: false,
        retryAfter: 1,
      });
      clock.mockReturnValue(base + 60_000);
      expect((await limiter.consume(burstKey, { max: 4, window: 60 })).allowed).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
  it("continues an anonymous authorization after signing in on the central", async () => {
    const owner = await account();
    const start = await request(relying, client.origin, "/sign-in/social", {
      provider: client.providerId,
      callbackURL: `${client.origin}/inicio`,
      disableRedirect: true,
    });
    expect(start.status).toBe(200);
    const { url } = await start.json();
    const prompt = await central.handler(new Request(url));
    const loginUrl = new URL(prompt.headers.get("location") ?? centralOrigin, centralOrigin);
    expect(loginUrl.pathname).toBe("/entrar");
    expect(loginUrl.searchParams.get("sig")).toBeTruthy();
    const login = await request(central, centralOrigin, "/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
      oauth_query: loginUrl.searchParams.toString(),
    });
    expect(login.status, await login.clone().text()).toBe(200);
    const result = await login.json();
    expect(result.redirect).toBe(true);
    const completeLogin = await complete({ callback: result.url, stateCookie: cookies(start) });
    expect(completeLogin.headers.get("location")).toBe(`${client.origin}/inicio`);
    const session = await request(
      relying,
      client.origin,
      "/get-session",
      undefined,
      cookies(completeLogin),
    );
    expect((await session.json()).user.id).toBe(owner.user.id);
  });
  it("uses the existing identity, browser-bound state and a one-use code; DB revocation is immediate", async () => {
    const owner = await account();
    const flow = await authorize(owner.cookie);
    const response = await complete(flow);
    expect(response.status, await response.clone().text()).toBe(302);
    expect(response.headers.get("location")).toBe(`${client.origin}/inicio`);
    const cookie = cookies(response);
    expect(cookie).toContain("informach-cozya.session_token=");
    expect(cookie).not.toContain("session_data=");
    const session = await request(relying, client.origin, "/get-session", undefined, cookie);
    expect((await session.json()).user.id).toBe(owner.user.id);
    const replay = await complete(flow);
    expect(cookies(replay)).not.toContain("informach-cozya.session_token=");
    const pending = await authorize(owner.cookie);
    await db.delete(sessions).where(eq(sessions.userId, owner.user.id));
    expect(
      await (await request(relying, client.origin, "/get-session", undefined, cookie)).json(),
    ).toBeNull();
    const afterRevocation = await complete(pending);
    expect(cookies(afterRevocation)).not.toContain("informach-cozya.session_token=");
  });
  it("refuses callbacks without the initiating browser and expired authorization codes", async () => {
    const owner = await account();
    const flow = await authorize(owner.cookie);
    const noState = await complete(flow, "");
    expect(cookies(noState)).not.toContain("informach-cozya.session_token=");
    const expiring = await authorize(owner.cookie);
    // Isolated fixture: only this test's central OAuth authorization record is expired.
    const records = await db.select().from(verifications);
    const codeRecords = records.filter((row) => {
      try {
        return (
          JSON.parse(row.value).userId === owner.user.id &&
          JSON.parse(row.value).query?.client_id === client.clientId
        );
      } catch {
        return false;
      }
    });
    expect(codeRecords.length).toBeGreaterThan(0);
    for (const codeRecord of codeRecords)
      await db
        .update(verifications)
        .set({ expiresAt: new Date(0) })
        .where(eq(verifications.id, codeRecord.id));
    const expired = await complete(expiring);
    expect(
      new URL(expired.headers.get("location") ?? client.origin).searchParams.get("error"),
    ).toBe("invalid_code");
    expect(cookies(expired)).not.toContain("informach-cozya.session_token=");
  });
  it("rejects arbitrary callbacks, missing PKCE, standalone app credentials and provisioning drift", async () => {
    const owner = await account();
    const query = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: "https://evil.example/callback",
      response_type: "code",
      scope: "openid email",
    });
    const wrongReturn = await request(
      central,
      centralOrigin,
      `/oauth2/authorize?${query}`,
      undefined,
      owner.cookie,
    );
    expect(wrongReturn.headers.get("location") ?? "").not.toContain("https://evil.example");
    query.set("redirect_uri", client.redirectUri);
    const noPkce = await request(
      central,
      centralOrigin,
      `/oauth2/authorize?${query}`,
      undefined,
      owner.cookie,
    );
    expect(new URL(noPkce.headers.get("location") ?? centralOrigin).searchParams.has("code")).toBe(
      false,
    );
    expect(
      (
        await request(relying, client.origin, "/sign-in/email", {
          email: owner.user.email,
          password: "irrelevant",
        })
      ).status,
    ).not.toBe(200);
    expect((await request(relying, client.origin, "/update-user", { name: "other" })).status).toBe(
      403,
    );
    await provisionWebSso(db, environment);
    const [existing] = await db
      .select()
      .from(ssoClients)
      .where(eq(ssoClients.clientId, client.clientId));
    if (!existing) throw new Error("Test OAuth client is missing");
    await db.update(ssoClients).set({ requirePKCE: false }).where(eq(ssoClients.id, existing.id));
    await expect(provisionWebSso(db, environment)).rejects.toThrow("incompatible security");
    await db.update(ssoClients).set({ requirePKCE: true }).where(eq(ssoClients.id, existing.id));
    // A client registered for web SSO is not available to the Edi issuer.
    expect(
      await db.select().from(oauthClients).where(eq(oauthClients.clientId, client.clientId)),
    ).toHaveLength(0);
  });
});

/** Independent RFC 6238 authenticator for synthetic enrollment fixtures. */
function totpCode(uri: string) {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("Missing authenticator fixture");
  const bits = [...secret.toUpperCase()]
    .map((char) => {
      const value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
      if (value < 0) throw new Error("Invalid base32 fixture");
      return value.toString(2).padStart(5, "0");
    })
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = (hash[hash.length - 1] ?? 0) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function gate() {
  let resume: () => void = () => {
    throw new Error("Gate not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    resume = resolve;
  });
  return { promise, resolve: () => resume() };
}
