import { randomUUID } from "node:crypto";
import {
  DEVICE_CODE_GRANT_TYPE,
  extendOAuthProvider,
  oauthDeviceAuthorization,
  oauthProvider,
} from "@better-auth/oauth-provider";
import type { Database } from "@informach/db";
import {
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthDeviceCodes,
  oauthJwks,
  oauthRefreshTokens,
  oauthResources,
} from "@informach/db/schema";
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";

export type DesktopOAuthConfig = { audience: string; clientId: string };
export const DESKTOP_SCOPES = ["edi:license", "edi:devices", "offline_access"];
export function desktopOAuthSchema() {
  return {
    jwks: oauthJwks,
    oauthClient: oauthClients,
    oauthResource: oauthResources,
    oauthClientResource: oauthClientResources,
    oauthRefreshToken: oauthRefreshTokens,
    oauthAccessToken: oauthAccessTokens,
    oauthConsent: oauthConsents,
    oauthClientAssertion: oauthClientAssertions,
    deviceCode: oauthDeviceCodes,
  };
}

export function desktopOAuthPlugins(config: DesktopOAuthConfig) {
  const audience = new URL(config.audience);
  if (audience.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(audience.hostname))
    throw new Error("Desktop OAuth requires HTTPS");
  const grantMarker: BetterAuthPlugin = {
    id: "edi-grant-marker",
    init(ctx) {
      extendOAuthProvider(ctx, {
        claims: { accessToken: ({ grantType }) => ({ edi_grant: grantType }) },
      });
    },
  };
  return [
    jwt({ jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } } }),
    oauthProvider({
      loginPage: "/entrar",
      consentPage: "/conectar",
      scopes: DESKTOP_SCOPES,
      resources: [
        {
          identifier: config.audience,
          name: "API desktop Edi",
          allowedScopes: DESKTOP_SCOPES,
          accessTokenTtl: 300,
          refreshTokenTtl: 30 * 86400,
        },
      ],
      accessTokenExpiresIn: 300,
      refreshTokenExpiresIn: 30 * 86400,
      refreshTokenReuseInterval: 0,
      allowDynamicClientRegistration: false,
      enforcePerClientResources: true,
      clientPrivileges: () => false,
      resourcePrivileges: () => false,
    }),
    oauthDeviceAuthorization({
      verificationUri: "/conectar",
      expiresIn: "10m",
      interval: "5s",
      validateClient: (clientId) => clientId === config.clientId,
    }),
    grantMarker,
  ];
}

export { DEVICE_CODE_GRANT_TYPE };

const accessClaims = z.object({
  sub: z.string().min(1),
  jti: z.string().min(1),
  iat: z.int().positive(),
  exp: z.int().positive(),
  aud: z.string(),
  iss: z.string(),
  client_id: z.string(),
  scope: z.string(),
  edi_grant: z.string(),
});
export function createDesktopTokenVerifier(
  config: DesktopOAuthConfig & {
    baseUrl: string;
    handler: (request: Request) => Promise<Response>;
  },
) {
  const issuer = `${config.baseUrl.replace(/\/$/, "")}/api/auth`;
  return async (authorization: string | null, scope: "edi:license" | "edi:devices") => {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 16384)
      throw new Error("invalid_desktop_token");
    const response = await config.handler(new Request(`${issuer}/jwks`));
    if (!response.ok) throw new Error("desktop_jwks_unavailable");
    const jwks = z
      .object({
        keys: z
          .array(
            z.object({
              kty: z.literal("OKP"),
              crv: z.literal("Ed25519"),
              kid: z.string(),
              x: z.string(),
              alg: z.literal("EdDSA").optional(),
              use: z.literal("sig").optional(),
            }),
          )
          .min(1)
          .max(32),
      })
      .parse(await response.json());
    const verified = await jwtVerify(authorization.slice(7), createLocalJWKSet(jwks), {
      issuer,
      audience: config.audience,
      algorithms: ["EdDSA"],
      typ: "at+jwt",
      maxTokenAge: 300,
      clockTolerance: 5,
    });
    const claims = accessClaims.parse(verified.payload);
    if (
      claims.client_id !== config.clientId ||
      claims.aud !== config.audience ||
      !claims.scope.split(" ").includes(scope)
    )
      throw new Error("invalid_desktop_scope");
    return {
      userId: claims.sub,
      jwtId: claims.jti,
      issuedAt: claims.iat,
      grantType: claims.edi_grant,
    };
  };
}

/** Explicit deployment/setup operation, never a public registration endpoint. */
export async function provisionDesktopOAuth(db: Database, config: DesktopOAuthConfig) {
  await db.transaction(async (tx) => {
    await tx
      .insert(oauthResources)
      .values({
        id: randomUUID(),
        identifier: config.audience,
        name: "API desktop Edi",
        allowedScopes: DESKTOP_SCOPES,
        accessTokenTtl: 300,
        refreshTokenTtl: 30 * 86400,
        disabled: false,
        dpopBoundAccessTokensRequired: false,
        policyVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: oauthResources.identifier });
    await tx
      .insert(oauthClients)
      .values({
        id: randomUUID(),
        clientId: config.clientId,
        name: "Suíte Edi para Windows",
        redirectUris: [],
        applicationType: "native",
        tokenEndpointAuthMethod: "none",
        grantTypes: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
        scopes: DESKTOP_SCOPES,
        requirePKCE: true,
        disabled: false,
        skipConsent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: oauthClients.clientId });
    const current = (
      await tx
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, config.clientId))
        .limit(1)
    )[0];
    const resource = (
      await tx
        .select()
        .from(oauthResources)
        .where(eq(oauthResources.identifier, config.audience))
        .limit(1)
    )[0];
    const sameSet = (actual: readonly string[] | null, expected: readonly string[]) =>
      actual !== null &&
      actual.length === expected.length &&
      new Set(actual).size === expected.length &&
      expected.every((value) => actual.includes(value));
    if (!current || !resource)
      throw new Error("Desktop OAuth provisioning did not create its policy");
    const clientPolicy: Record<string, boolean> = {
      clientSecret: current.clientSecret === null,
      clientDiscoveryId: current.clientDiscoveryId === null,
      tokenEndpointAuthMethod: current.tokenEndpointAuthMethod === "none",
      applicationType: current.applicationType === "native",
      disabled: current.disabled === false,
      skipConsent: current.skipConsent === false,
      requirePKCE: current.requirePKCE === true,
      grantTypes: sameSet(current.grantTypes, [DEVICE_CODE_GRANT_TYPE, "refresh_token"]),
      scopes: sameSet(current.scopes, DESKTOP_SCOPES),
      redirectUris: sameSet(current.redirectUris, []),
      clientCredentialsScopes: sameSet(current.clientCredentialsScopes, []),
      dpopBoundAccessTokens: current.dpopBoundAccessTokens === false,
      userId: current.userId === null,
      subjectType: current.subjectType === null,
      responseTypes: current.responseTypes === null || sameSet(current.responseTypes, []),
      jwks: current.jwks === null,
      jwksUri: current.jwksUri === null,
    };
    const resourcePolicy: Record<string, boolean> = {
      disabled: resource.disabled === false,
      allowedScopes: sameSet(resource.allowedScopes, DESKTOP_SCOPES),
      accessTokenTtl: resource.accessTokenTtl === 300,
      refreshTokenTtl: resource.refreshTokenTtl === 30 * 86400,
      dpopBoundAccessTokensRequired: resource.dpopBoundAccessTokensRequired === false,
      signingAlgorithm: resource.signingAlgorithm === null || resource.signingAlgorithm === "EdDSA",
      signingKeyId: resource.signingKeyId === null,
      customClaims: resource.customClaims === null,
      policyVersion: resource.policyVersion === 1,
    };
    for (const [kind, policy] of [
      ["client", clientPolicy],
      ["resource", resourcePolicy],
    ] as const) {
      const incompatible = Object.keys(policy).filter((field) => !policy[field]);
      if (incompatible.length)
        throw new Error(
          `Existing desktop OAuth ${kind} has incompatible security settings: ${incompatible.join(", ")}`,
        );
    }
    await tx
      .insert(oauthClientResources)
      .values({
        id: randomUUID(),
        clientId: config.clientId,
        resourceId: config.audience,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });
}
