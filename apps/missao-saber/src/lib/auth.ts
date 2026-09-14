import "server-only";
import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { cache } from "react";
import { buildUnsubscribeUrl, emails } from "./emails";
import { env } from "./env";
import { authObservability } from "./observability";
import { authSecondaryStorage } from "./redis";

export const authResult = createAuth({
  appName: "Missão Saber",
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  secondaryStorage: authSecondaryStorage,
  observability: authObservability,
  rateLimitRules: {
    "/sign-up/email": { window: 3600, max: 5 },
    "/sign-in/email": { window: 60, max: 5 },
    "/sign-in/email-otp": { window: 600, max: 5 },
    "/email-otp/send-verification-otp": { window: 60, max: 5 },
    "/email-otp/verify-email": { window: 60, max: 10 },
    "/email-otp/request-password-reset": { window: 3600, max: 3 },
    "/email-otp/reset-password": { window: 3600, max: 5 },
  },
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl,
  organizations: { enabled: false },
  email: { verification: "otp", signIn: { magicLink: false, otp: true }, forgetPassword: "otp" },
  // This app offers deletion of its own data. Global Informach account deletion
  // stays disabled here until cancellation across every app is coordinated.
  accountDeletion: { enabled: false },
});
export const { auth } = authResult;
const helpers = createServerHelpers(authResult, { signInPath: "/entrar" });
export const getCurrentUser = cache(helpers.getCurrentUserServer);
export const getSession = cache(helpers.getServerSession);
export const requireUser = helpers.requireUserServer;
export const requirePageUser = helpers.redirectIfUnauthenticated;
