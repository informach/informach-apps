import { createAuth, UnauthorizedError } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { redirect } from "next/navigation";
import { cache } from "react";
import { emails, getEmailUnsubscribeMailto } from "@/features/emails/service";
import { AUTH_SIGN_IN_PATH } from "./auth-routing";
import { env } from "./env";
import { logger } from "./logger";
import { authObservability } from "./observability";
import { authSecondaryStorage } from "./redis";

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

/**
 * Defesa anti-brute-force explícita para os endpoints sensíveis do Better Auth.
 *
 * Por que explícito em vez de confiar nos defaults do Better Auth: o package
 * traz defaults sãos hoje (`@informach/auth/CLAUDE.md` §3.4), mas eles podem
 * mudar entre minor versions. Travar aqui garante que upgrades do Better Auth
 * não relaxem proteções silenciosamente.
 */
const productionRateLimitRules = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-in/email-otp": { window: 600, max: 5 },
  "/sign-up/email": { window: 3600, max: 5 },
  "/email-otp/send-verification-otp": { window: 60, max: 5 },
  "/email-otp/verify-email": { window: 60, max: 10 },
  "/forget-password": { window: 3600, max: 3 },
  "/forget-password/email-otp": { window: 3600, max: 3 },
  "/email-otp/request-password-reset": { window: 3600, max: 3 },
  "/email-otp/reset-password": { window: 3600, max: 5 },
  "/reset-password": { window: 3600, max: 5 },
  "/verify-email": { window: 60, max: 10 },
} as const;

/**
 * E2E só relaxa quando explicitamente habilitado. Defesa em camadas: env.ts
 * rejeita E2E_RELAX_AUTH_RATE_LIMITS=1 em produção para impedir misconfig.
 */
const rateLimitRules =
  env.E2E_RELAX_AUTH_RATE_LIMITS === "1"
    ? {
        "/email-otp/send-verification-otp": { window: 60, max: 100 },
        "/email-otp/verify-email": { window: 60, max: 100 },
        "/sign-in/email-otp": { window: 60, max: 100 },
        "/sign-up/email": { window: 60, max: 100 },
      }
    : productionRateLimitRules;

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
  unsubscribeMailto: getEmailUnsubscribeMailto(),
  socialProviders: googleProvider ? { google: googleProvider } : undefined,
  secondaryStorage: authSecondaryStorage,
  observability: authObservability,
  rateLimitRules,
  // Cozya mantém login por e-mail/senha. OTP cobre fluxos que exigem
  // confirmação por e-mail e também o login opcional sem senha.
  email: {
    verification: "otp",
    signIn: { magicLink: false, otp: true },
    forgetPassword: "otp",
  },
  // LGPD: when an account is deleted, cancel any active subscriptions and
  // free credit balances for the user immediately. Ledger rows stay (fiscal).
  accountDeletion: {
    enabled: true,
    onBeforeDelete: async (user) => {
      const { billing } = await import("@/features/billing/service");
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
      ? `${AUTH_SIGN_IN_PATH}?next=${encodeURIComponent(next)}`
      : AUTH_SIGN_IN_PATH;
    redirect(target);
  }
  return user;
}
