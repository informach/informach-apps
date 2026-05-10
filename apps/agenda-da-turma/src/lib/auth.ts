import { createAuth, UnauthorizedError } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { redirect } from "next/navigation";
import { cache } from "react";
import { billing } from "./billing";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";
import { authObservability } from "./observability";
import { authSecondaryStorage } from "./redis";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const AUTH_SIGN_IN_PATH = "/login";

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

/**
 * Defesa anti-brute-force explícita para os endpoints sensíveis do Better Auth.
 * Mesma estratégia do Cozya — defaults do package são sãos hoje, mas travar
 * aqui garante que upgrades não relaxem proteções silenciosamente.
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
  socialProviders: googleProvider ? { google: googleProvider } : undefined,
  secondaryStorage: authSecondaryStorage,
  observability: authObservability,
  rateLimitRules,
  // OTP-only para signup, sign-in e recuperação de senha. UX consistente em
  // mobile e dispensa páginas extras para link callbacks.
  email: {
    verification: "otp",
    signIn: { magicLink: false, otp: true },
    forgetPassword: "otp",
  },
  // LGPD: ao deletar a conta, cancelar assinaturas ativas imediatamente.
  // Saldos de crédito permanecem (retenção fiscal). Linhas de billing também
  // não são deletadas — `subjectId` retido para NF-e.
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
