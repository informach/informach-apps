"use client";
import { createInformachAuthClient } from "@informach/auth/client";
import { webSsoEnvironment, webSsoOrigin } from "@informach/auth/web-sso-contract";

export const authClient = createInformachAuthClient({
  baseURL: webSsoOrigin("conta", webSsoEnvironment("conta", process.env.NEXT_PUBLIC_APP_URL)),
  webSsoProvider: true,
  // AuthForm validates the callback and navigates once; the SDK must not race it.
  redirectMode: "manual",
  twoFactor: true,
  email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
});
