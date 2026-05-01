import { passkeyClient } from "@better-auth/passkey/client";
import {
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export type CreateAuthClientConfig = {
  baseURL: string;
  organizations?: boolean;
  passkey?: boolean;
  twoFactor?: boolean | { onRedirect?: () => void };
};

export function createInformachAuthClient(config: CreateAuthClientConfig) {
  const plugins: ReturnType<
    | typeof magicLinkClient
    | typeof organizationClient
    | typeof passkeyClient
    | typeof twoFactorClient
  >[] = [magicLinkClient()];

  if (config.organizations) plugins.push(organizationClient());
  if (config.passkey) plugins.push(passkeyClient());
  if (config.twoFactor) {
    const twoFactorOptions =
      typeof config.twoFactor === "object" && config.twoFactor.onRedirect
        ? { onTwoFactorRedirect: config.twoFactor.onRedirect }
        : undefined;
    plugins.push(twoFactorClient(twoFactorOptions));
  }

  return createAuthClient({
    baseURL: config.baseURL,
    plugins,
  });
}

export type InformachAuthClient = ReturnType<typeof createInformachAuthClient>;
