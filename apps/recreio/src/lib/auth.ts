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
  appName: "Recreio",
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  secondaryStorage: authSecondaryStorage,
  // Um aparelho da casa serve a vários perfis: sair da conta, trocar de
  // perfil ou revogar um aparelho precisa valer na hora, inclusive para quem
  // ainda carrega o cookie assinado da sessão.
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
  // A exclusão da conta por aqui fica desligada até existirem as regras de
  // sucessão do mundo (quem fica com um mundo compartilhado quando o
  // responsável sai). Ligar antes apagaria a conta sem tratar os dados do
  // Recreio.
  accountDeletion: { enabled: false },
});
export const { auth } = authResult;
const helpers = createServerHelpers(authResult, { signInPath: "/entrar" });
export const getCurrentUser = cache(helpers.getCurrentUserServer);
export const getSession = cache(helpers.getServerSession);
export const requireUser = helpers.requireUserServer;
export async function requirePageUser(next?: string) {
  const destination = safeDestination(next ?? (await headers()).get("x-recreio-path"));
  const user = await helpers.redirectIfUnauthenticated(destination);
  if (!user.emailVerified) redirect(`/entrar?confirmar=1&next=${encodeURIComponent(destination)}`);
  return user;
}
