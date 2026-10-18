import "server-only";
import { type CreateAuthResult, createAuth } from "@informach/auth";
import { emailUnsubscribeUrl, getEmails, sendStaffOnlyEmail } from "./emails";
import { getEnv } from "./env";
import { reportOperationalError } from "./observability";

/**
 * Sessão do Bastidores: um expediente. Passou disso, entra de novo com senha e
 * código. O pacote usa `expiresIn` também como teto, então nem `rememberMe:
 * false` (1 dia no Better Auth) estica a sessão; `updateAge` igual impede a
 * renovação.
 */
const SESSION_SECONDS = 12 * 60 * 60;

let instance: CreateAuthResult | undefined;

/**
 * Entrada só por senha seguida do código do autenticador. O plugin de duas
 * etapas do Better Auth só intercepta `/sign-in/email`; qualquer outra rota
 * que crie sessão seria um caminho sem a segunda etapa. Três travas:
 * - a rota `/api/auth/[...all]` só atende os caminhos de `auth-routes.ts`;
 * - link mágico e entrada por código no e-mail não carregam;
 * - confirmar e-mail não cria sessão (`autoSignInAfterVerification: false`).
 * A senha é criada ou trocada pelo código enviado ao e-mail, que só sai para
 * contas da equipe (ver `sendStaffOnlyEmail`). A ativação das duas etapas pede
 * antes um código no e-mail (`features/two-factor`), e ligar as duas etapas
 * encerra as outras sessões da conta (no pacote, depois de `verify-totp`).
 */
export function getAuth(): CreateAuthResult {
  if (instance) return instance;
  const env = getEnv();
  const emails = getEmails();
  instance = createAuth({
    appName: "Bastidores",
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
    disableSignup: true,
    session: {
      cookieCache: { enabled: false },
      expiresIn: SESSION_SECONDS,
      updateAge: SESSION_SECONDS,
    },
    twoFactor: { enabled: true, issuer: "Bastidores Informach" },
    sendEmail: sendStaffOnlyEmail,
    renderTemplate: emails.renderTemplate,
    buildUnsubscribeUrl: emailUnsubscribeUrl,
    email: {
      verification: "otp",
      signIn: { magicLink: false, otp: false },
      forgetPassword: "otp",
      autoSignInAfterVerification: false,
    },
    observability: {
      onAuditPersistenceFailure: (event) =>
        reportOperationalError("auth.audit_persistence_failed", undefined, event),
      onSecurityEvent: (event) => {
        if (event.type === "two_factor_session_cleanup_failed")
          reportOperationalError("auth.session_cleanup_failed", undefined, {
            actorId: event.userId,
            // all_sessions_revoked, two_factor_reverted ou failed: no último, a
            // conta ficou com sessões antigas de pé e precisa de "Encerrar sessões".
            category: event.metadata?.fallback,
          });
      },
    },
  });
  return instance;
}
