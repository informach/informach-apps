import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { emails } from "./emails";
import { env } from "./env";
import { authSecondaryStorage } from "./redis";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const authResult = createAuth({
  appName: APPS.agendaDaTurma.name,
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl: (identifier, category) => {
    const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
  },
  unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
  organizations: { enabled: true },
  socialProviders: googleProvider ? { google: googleProvider } : undefined,
  secondaryStorage: authSecondaryStorage,
});

export const {
  auth,
  getCurrentUser,
  requireUser,
  getSession,
  requireRole,
  requireAdmin,
  hasRole,
  assertRole,
  assertPermission,
} = authResult;

export const {
  getServerSession,
  getCurrentUserServer,
  requireUserServer,
  redirectIfUnauthenticated,
} = createServerHelpers(authResult);
