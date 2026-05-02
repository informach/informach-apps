import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { billing } from "./billing";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";
import { authSecondaryStorage } from "./redis";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const authResult = createAuth({
  appName: APPS.cozya.name,
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
  socialProviders: googleProvider ? { google: googleProvider } : undefined,
  secondaryStorage: authSecondaryStorage,
  // LGPD: when an account is deleted, cancel any active subscriptions and
  // free credit balances for the user immediately. Ledger rows stay (fiscal).
  accountDeletion: {
    enabled: true,
    onBeforeDelete: async (user) => {
      const result = await billing.cancelBillingForSubject({ type: "user", id: user.id });
      if (result.failed > 0) {
        logger.error(
          {
            userId: user.id,
            canceled: result.canceled,
            failed: result.failed,
          },
          "auth.account_deletion.billing_partial",
        );
      }
    },
  },
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

export const {
  getServerSession,
  getCurrentUserServer,
  requireUserServer,
  redirectIfUnauthenticated,
} = createServerHelpers(authResult);
