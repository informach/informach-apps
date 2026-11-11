import { type WebSsoConfig, webSsoClient, webSsoOrigin } from "./web-sso-contract";

export { type WebSsoConfig, webSsoClient, webSsoOrigin } from "./web-sso-contract";

import { randomUUID } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getCollectionApps } from "@informach/config/collections";
import { type Database, db } from "@informach/db";
import {
  ssoAccessTokens,
  ssoClientAssertions,
  ssoClientResources,
  ssoClients,
  ssoConsents,
  ssoJwks,
  ssoRefreshTokens,
  ssoResources,
  users,
} from "@informach/db/schema";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod/v4";
import { bindWebSsoParent } from "./web-sso-context";

const SCOPES = ["openid", "profile", "email"];

export function webSsoSchema() {
  return {
    jwks: ssoJwks,
    oauthClient: ssoClients,
    oauthResource: ssoResources,
    oauthClientResource: ssoClientResources,
    oauthRefreshToken: ssoRefreshTokens,
    oauthAccessToken: ssoAccessTokens,
    oauthConsent: ssoConsents,
    oauthClientAssertion: ssoClientAssertions,
  };
}

const identity = z.object({ sub: z.string().min(1), sid: z.string().min(1) });

export function webSsoPlugins(config: WebSsoConfig) {
  if (config.role === "provider")
    return [
      jwt({ jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } } }),
      oauthProvider({
        loginPage: "/entrar",
        consentPage: "/conectar",
        scopes: SCOPES,
        grantTypes: ["authorization_code"],
        // The installed provider also uses this TTL for its signed login prompt.
        // Allow email verification to finish; codes remain single-use and PKCE-bound.
        codeExpiresIn: 600,
        accessTokenExpiresIn: 120,
        idTokenExpiresIn: 120,
        allowDynamicClientRegistration: false,
        clientPrivileges: () => false,
        resourcePrivileges: () => false,
      }),
    ];
  const client = webSsoClient(config.app, config.environment);
  const issuer = `${webSsoOrigin("conta", config.environment)}/api/auth`;
  return [
    genericOAuth({
      config: [
        {
          providerId: client.providerId,
          name: "Minha conta",
          clientId: client.clientId,
          discoveryUrl: `${issuer}/.well-known/openid-configuration`,
          requireIdTokenVerification: true,
          redirectURI: client.redirectUri,
          pkce: true,
          scopes: SCOPES,
          disableSignUp: true,
          requireEmailVerification: true,
          disableProviderLogout: true,
          // Better Auth verifies signature, issuer, audience and the browser's nonce
          // BEFORE calling this hook. Refuse an OAuth-only response without an ID token.
          async getUserInfo(tokens) {
            if (!tokens.idToken) return null;
            const claims = identity.safeParse(decodeJwt(tokens.idToken));
            if (!claims.success) return null;
            if (!(await bindWebSsoParent(claims.data.sub, claims.data.sid))) return null;
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, claims.data.sub))
              .limit(1);
            if (
              !user?.emailVerified ||
              (user.banned && (!user.banExpiresAt || user.banExpiresAt > new Date()))
            )
              return null;
            return {
              sub: user.id,
              email: user.email,
              emailVerified: true,
              name: user.name,
              image: user.image ?? undefined,
            };
          },
        },
      ],
    }),
  ];
}

/** Deployment operation: approved exact callbacks only; fail closed on policy drift. */
export async function provisionWebSso(
  database: Database,
  environment: WebSsoConfig["environment"],
) {
  await database.transaction(async (tx) => {
    for (const app of getCollectionApps("compasso")) {
      const client = webSsoClient(app.slug, environment);
      await tx
        .insert(ssoClients)
        .values({
          id: randomUUID(),
          clientId: client.clientId,
          name: app.name,
          redirectUris: [client.redirectUri],
          applicationType: "web",
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code"],
          responseTypes: ["code"],
          scopes: SCOPES,
          requirePKCE: true,
          disabled: false,
          skipConsent: true,
          // The provider emits the signed `sid` claim for registered logout clients.
          // Apps bind their session to this root; they don't expose a logout redirect.
          enableEndSession: true,
          subjectType: "public",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: ssoClients.clientId });
      const [current] = await tx
        .select()
        .from(ssoClients)
        .where(eq(ssoClients.clientId, client.clientId));
      const sameSet = (actual: string[] | null, expected: string[]) =>
        actual?.length === expected.length &&
        new Set(actual).size === expected.length &&
        expected.every((x) => actual.includes(x));
      if (
        !current ||
        current.clientSecret !== null ||
        current.clientDiscoveryId !== null ||
        current.disabled !== false ||
        current.skipConsent !== true ||
        current.requirePKCE !== true ||
        current.applicationType !== "web" ||
        current.tokenEndpointAuthMethod !== "none" ||
        current.subjectType !== "public" ||
        current.enableEndSession !== true ||
        current.userId !== null ||
        current.jwks !== null ||
        current.jwksUri !== null ||
        current.backchannelLogoutUri !== null ||
        current.dpopBoundAccessTokens !== false ||
        !sameSet(current.redirectUris, [client.redirectUri]) ||
        !sameSet(current.scopes, SCOPES) ||
        !sameSet(current.grantTypes, ["authorization_code"]) ||
        !sameSet(current.responseTypes, ["code"]) ||
        !sameSet(current.clientCredentialsScopes, []) ||
        current.postLogoutRedirectUris !== null
      )
        throw new Error(`Existing web SSO client has incompatible security settings: ${app.slug}`);
    }
  });
}
