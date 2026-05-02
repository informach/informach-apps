import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { billing } from "./billing";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";
import { authObservability } from "./observability";
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
  observability: authObservability,
  // LGPD: when an account is deleted, cancel any active subscriptions for the
  // user immediately. Personal credit balances stay intact (fiscal retention).
  // For org subscriptions: an org owner deleting their personal account does
  // NOT cascade-cancel the org's billing — that requires explicit org deletion.
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
} = createServerHelpers(authResult, { signInPath: "/login" });
