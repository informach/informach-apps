import { passkeyClient } from "@better-auth/passkey/client";
import {
  emailOTPClient,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Mirrors {@link CreateAuthEmailConfig} on the server: each app must pass the
 * same email config to the client so the right plugins are loaded.
 */
export type CreateAuthClientEmailConfig = {
  /** Default `"otp"`. Loads `emailOTPClient` when `"otp"`. */
  verification?: "otp" | "link";
  signIn?: {
    /** Default `true`. Loads `magicLinkClient`. */
    magicLink?: boolean;
    /** Default `false`. Loads `emailOTPClient`. */
    otp?: boolean;
  };
  /** Default `"link"`. When `"otp"`, loads `emailOTPClient`. */
  forgetPassword?: "link" | "otp";
};

export type CreateAuthClientConfig = {
  baseURL: string;
  email?: CreateAuthClientEmailConfig;
  organizations?: boolean;
  passkey?: boolean;
  twoFactor?: boolean | { onRedirect?: () => void };
};

function emailOtpClientRequired(email: CreateAuthClientEmailConfig | undefined): boolean {
  const verification = email?.verification ?? "otp";
  const otpSignIn = email?.signIn?.otp === true;
  const otpForgetPassword = email?.forgetPassword === "otp";
  return verification === "otp" || otpSignIn || otpForgetPassword;
}

function magicLinkClientRequired(email: CreateAuthClientEmailConfig | undefined): boolean {
  return email?.signIn?.magicLink !== false;
}

export function createInformachAuthClient(config: CreateAuthClientConfig) {
  // Plugins are passed as a literal tuple so Better Auth can infer the
  // resulting client's method shape (e.g. `emailOtp.verifyEmail`). Each branch
  // returns either a single-element tuple or an empty tuple so TypeScript
  // narrows the spread correctly.
  const twoFactorOptions =
    typeof config.twoFactor === "object" && config.twoFactor.onRedirect
      ? { onTwoFactorRedirect: config.twoFactor.onRedirect }
      : undefined;

  return createAuthClient({
    baseURL: config.baseURL,
    plugins: [
      ...(magicLinkClientRequired(config.email) ? ([magicLinkClient()] as const) : ([] as const)),
      ...(emailOtpClientRequired(config.email) ? ([emailOTPClient()] as const) : ([] as const)),
      ...(config.organizations ? ([organizationClient()] as const) : ([] as const)),
      ...(config.passkey ? ([passkeyClient()] as const) : ([] as const)),
      ...(config.twoFactor ? ([twoFactorClient(twoFactorOptions)] as const) : ([] as const)),
    ],
  });
}

export type InformachAuthClient = ReturnType<typeof createInformachAuthClient>;
