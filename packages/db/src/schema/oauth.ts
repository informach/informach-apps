import { createOAuthTables } from "./oauth-tables";

export const {
  oauthJwks,
  oauthClients,
  oauthResources,
  oauthClientResources,
  oauthRefreshTokens,
  oauthAccessTokens,
  oauthConsents,
  oauthClientAssertions,
} = createOAuthTables("oauth");

export const {
  oauthJwks: ssoJwks,
  oauthClients: ssoClients,
  oauthResources: ssoResources,
  oauthClientResources: ssoClientResources,
  oauthRefreshTokens: ssoRefreshTokens,
  oauthAccessTokens: ssoAccessTokens,
  oauthConsents: ssoConsents,
  oauthClientAssertions: ssoClientAssertions,
} = createOAuthTables("sso");

export { oauthDeviceCodes } from "./oauth-tables";
