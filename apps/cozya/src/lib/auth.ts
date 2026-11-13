import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import "server-only";
import { createAuth, UnauthorizedError } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { buildUnsubscribeToken } from "@informach/emails";
import { redirect } from "next/navigation";
import { cache } from "react";
import { emails, getEmailUnsubscribeMailto } from "@/features/emails/service";
import { AUTH_SIGN_IN_PATH } from "./auth-routing";
import { env } from "./env";
import { authObservability } from "./observability";

export const authResult = createAuth({
  appName: "Cozya",
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  webSso: {
    role: "client",
    app: "cozya",
    environment: webSsoEnvironment("cozya", env.NEXT_PUBLIC_APP_URL),
  },
  observability: authObservability,
  rateLimitRules: { "/sign-in/social": { window: 60, max: 10 } },
  email: { verification: "link", signIn: { magicLink: false }, forgetPassword: "link" },
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl: (identifier, category) =>
    `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category)}`,
  unsubscribeMailto: getEmailUnsubscribeMailto(),
});

export const {
  auth,
  getCurrentUser,
  requireUser,
  getSession,
  hasRole,
  assertRole,
  assertPermission,
} = authResult;

const serverHelpers = createServerHelpers(authResult, { signInPath: AUTH_SIGN_IN_PATH });

export const getServerSession = cache(serverHelpers.getServerSession);
export const getCurrentUserServer = cache(serverHelpers.getCurrentUserServer);

export const requireUserServer = cache(async () => {
  const user = await getCurrentUserServer();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
});

export async function redirectIfUnauthenticated(next?: string) {
  const user = await getCurrentUserServer();
  if (!user) {
    const target = next
      ? (`${AUTH_SIGN_IN_PATH}?next=${encodeURIComponent(next)}` as const)
      : AUTH_SIGN_IN_PATH;
    redirect(target);
  }
  return user;
}
