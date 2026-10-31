import "server-only";
import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { safeDestination } from "./destination";
import { buildUnsubscribeUrl, emails } from "./emails";
import { env } from "./env";
import { authObservability } from "./observability";
import { authSecondaryStorage } from "./redis";

export const authResult = createAuth({
  appName: "Bora Treinar",
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  secondaryStorage: authSecondaryStorage,
  // A TV e o celular da casa são compartilhados: sair da conta precisa valer
  // na hora, inclusive para quem ainda carrega o cookie assinado da sessão.
  session: { cookieCache: { enabled: false } },
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
  // LGPD: a conta Informach é compartilhada. A exclusão pede confirmação por
  // e-mail, recusa enquanto outro app tiver assinatura viva ou dados que só
  // ele sabe apagar (ver features/account/other-apps.ts) e, antes de apagar o
  // usuário, encerra a cobrança e os dados de treino deste app.
  accountDeletion: {
    enabled: true,
    requireCleanupSuccess: true,
    onBeforeDelete: async (user) => {
      const { hasOtherAppSubscriptions } = await import("@/features/billing/repository");
      if (await hasOtherAppSubscriptions(user.id))
        throw new Error(
          "Encerre as assinaturas dos outros apps Informach antes de excluir a conta compartilhada.",
        );
      const { otherAppWithData } = await import("@/features/account/other-apps");
      const outroApp = await otherAppWithData(user.id);
      if (outroApp)
        throw new Error(
          `Sua conta também tem dados no ${outroApp}. Peça a exclusão por lá, para apagar os dados daquele app junto com a conta.`,
        );
      const { closeBillingAndFamily } = await import("@/features/billing/service");
      const { clearFamily } = await import("@/features/familia/repository");
      await closeBillingAndFamily(user.id, () => clearFamily(user.id));
    },
  },
});
export const { auth } = authResult;
const helpers = createServerHelpers(authResult, { signInPath: "/entrar" });
export const getCurrentUser = cache(helpers.getCurrentUserServer);
export const getSession = cache(helpers.getServerSession);
export const requireUser = helpers.requireUserServer;
export async function requirePageUser(next?: string) {
  const destination = safeDestination(next ?? (await headers()).get("x-bora-path"));
  const user = await helpers.redirectIfUnauthenticated(destination);
  if (!user.emailVerified) redirect(`/entrar?confirmar=1&next=${encodeURIComponent(destination)}`);
  return user;
}
