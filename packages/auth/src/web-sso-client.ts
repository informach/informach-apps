import { createAuthClient } from "better-auth/react";
import { type WebSsoConfig, webSsoOrigin } from "./web-sso-contract";

/** App clients have no credential plugins; credential management belongs to the central. */
export function createWebSsoAuthClient(app: string, environment: WebSsoConfig["environment"]) {
  return createAuthClient({ baseURL: webSsoOrigin(app, environment) });
}
