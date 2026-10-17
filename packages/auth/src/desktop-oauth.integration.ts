import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { oauthClients, oauthResources, users } from "@informach/db/schema";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import {
  createDesktopTokenVerifier,
  DEVICE_CODE_GRANT_TYPE,
  provisionDesktopOAuth,
} from "./desktop-oauth";
import { createAuth } from "./index";

const baseUrl = "http://localhost:3006";
const oauth = { audience: `${baseUrl}/api/desktop`, clientId: "edi-desktop-integration" };
const { auth } = createAuth({
  appName: "Edi integration",
  baseUrl,
  secret: randomBytes(32).toString("hex"),
  desktopOAuth: oauth,
  trustedOrigins: [baseUrl],
  sendEmail: async () => ({ ok: true, status: "sent", deliveryId: randomUUID() }),
  renderTemplate: async () => ({
    html: "<p>Integration</p>",
    text: "Integration",
    subject: "Integration",
  }),
  buildUnsubscribeUrl: () => `${baseUrl}/unsubscribe`,
  email: { verification: "link", signIn: { magicLink: false } },
});
const verify = createDesktopTokenVerifier({ ...oauth, baseUrl, handler: auth.handler });
async function request(path: string, body: Record<string, string>, cookie = "", form = false) {
  return auth.handler(
    new Request(`${baseUrl}/api/auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
        Origin: baseUrl,
        Cookie: cookie,
      },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    }),
  );
}
beforeAll(async () => {
  if (process.env.EDI_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable PostgreSQL runner required");
  await provisionDesktopOAuth(db, oauth);
  await auth.$context;
});
describe("real desktop OAuth device grant", () => {
  it("fails closed for policy drift without silently overwriting existing settings", async () => {
    const clientChanges: Partial<typeof oauthClients.$inferInsert>[] = [
      { clientSecret: "unexpected" },
      { tokenEndpointAuthMethod: "client_secret_post" },
      { applicationType: "web" },
      { disabled: true },
      { skipConsent: true },
      { requirePKCE: false },
      { grantTypes: ["client_credentials"] },
      { scopes: ["offline_access"] },
      { redirectUris: ["https://example.test"] },
      { clientCredentialsScopes: ["edi:license"] },
      { dpopBoundAccessTokens: true },
      { responseTypes: ["code"] },
      { jwksUri: "https://example.test/jwks" },
    ];
    const resourceChanges: Partial<typeof oauthResources.$inferInsert>[] = [
      { disabled: true },
      { allowedScopes: [] },
      { accessTokenTtl: 301 },
      { refreshTokenTtl: 86400 },
      { dpopBoundAccessTokensRequired: true },
      { signingAlgorithm: "RS256" },
      { signingKeyId: "unexpected" },
      { customClaims: { unexpected: true } },
      { policyVersion: 2 },
    ];
    for (const change of clientChanges) {
      const policy = { audience: `${oauth.audience}/${randomUUID()}`, clientId: randomUUID() };
      await provisionDesktopOAuth(db, policy);
      await provisionDesktopOAuth(db, policy);
      await db.update(oauthClients).set(change).where(eq(oauthClients.clientId, policy.clientId));
      await expect(provisionDesktopOAuth(db, policy)).rejects.toThrow("client has incompatible");
    }
    for (const change of resourceChanges) {
      const policy = { audience: `${oauth.audience}/${randomUUID()}`, clientId: randomUUID() };
      await provisionDesktopOAuth(db, policy);
      await db
        .update(oauthResources)
        .set(change)
        .where(eq(oauthResources.identifier, policy.audience));
      await expect(provisionDesktopOAuth(db, policy)).rejects.toThrow("resource has incompatible");
    }
  });
  it("requires approval, mints scoped JWTs, rotates refresh and denies reuse", async () => {
    const email = `${randomUUID()}@example.test`;
    const password = randomBytes(24).toString("hex");
    const signup = await request("/sign-up/email", { email, password, name: "Integration" });
    expect(signup.status, await signup.text()).toBe(200);
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
    const signin = await request("/sign-in/email", { email, password });
    expect(signin.status).toBe(200);
    const cookie = signin.headers
      .getSetCookie()
      .map((header) => header.split(";")[0])
      .join("; ");
    const codeResponse = await request("/device/code", {
      client_id: oauth.clientId,
      scope: "edi:license edi:devices offline_access",
      resource: oauth.audience,
    });
    const code = z
      .object({ device_code: z.string(), user_code: z.string() })
      .parse(await codeResponse.json());
    const anonymous = await request("/device/approve", { userCode: code.user_code });
    expect(anonymous.status).toBe(401);
    const review = await auth.handler(
      new Request(`${baseUrl}/api/auth/device?user_code=${encodeURIComponent(code.user_code)}`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(review.status, await review.text()).toBe(200);
    const approval = await request("/device/approve", { userCode: code.user_code }, cookie);
    expect(approval.status, await approval.text()).toBe(200);
    const exchange = await request(
      "/oauth2/token",
      {
        client_id: oauth.clientId,
        device_code: code.device_code,
        grant_type: DEVICE_CODE_GRANT_TYPE,
        resource: oauth.audience,
      },
      "",
      true,
    );
    expect(exchange.status).toBe(200);
    const tokens = z
      .object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number() })
      .parse(await exchange.json());
    expect(tokens.expires_in).toBeLessThanOrEqual(300);
    expect((await verify(`Bearer ${tokens.access_token}`, "edi:license")).grantType).toBe(
      DEVICE_CODE_GRANT_TYPE,
    );
    const refreshed = await request(
      "/oauth2/token",
      {
        client_id: oauth.clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        resource: oauth.audience,
      },
      "",
      true,
    );
    expect(refreshed.status).toBe(200);
    const rotation = z
      .object({ access_token: z.string(), refresh_token: z.string() })
      .parse(await refreshed.json());
    expect(rotation.refresh_token).not.toBe(tokens.refresh_token);
    expect((await verify(`Bearer ${rotation.access_token}`, "edi:license")).grantType).toBe(
      "refresh_token",
    );
    const replay = await request(
      "/oauth2/token",
      {
        client_id: oauth.clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        resource: oauth.audience,
      },
      "",
      true,
    );
    expect(replay.status).toBe(400);
    const wrongResource = await request("/device/code", {
      client_id: oauth.clientId,
      scope: "edi:license",
      resource: "https://admin.example.test",
    });
    expect(wrongResource.status).toBeGreaterThanOrEqual(400);
  });
});
