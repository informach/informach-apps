import "server-only";
import { type CreateAuthResult, createAuth } from "@informach/auth";
import { createDesktopTokenVerifier } from "@informach/auth/desktop";
import { emailUnsubscribeUrl, getEmails } from "./emails";
import { getEnv } from "./env";
import { logger } from "./logger";

let instance: CreateAuthResult | undefined;
export function getAuth() {
  if (instance) return instance;
  const env = getEnv();
  const email = getEmails();
  instance = createAuth({
    appName: "Suíte Edi",
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
    session: { cookieCache: { enabled: false } },
    desktopOAuth: {
      audience: `${env.NEXT_PUBLIC_APP_URL}/api/desktop`,
      clientId: env.EDI_DESKTOP_CLIENT_ID,
    },
    sendEmail: email.sendEmail,
    renderTemplate: email.renderTemplate,
    buildUnsubscribeUrl: emailUnsubscribeUrl,
    email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
    observability: {
      onAuditPersistenceFailure: () => logger.error("auth.audit_persistence_failed"),
    },
  });
  return instance;
}
export function getDesktopVerifier() {
  const env = getEnv();
  return createDesktopTokenVerifier({
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    audience: `${env.NEXT_PUBLIC_APP_URL}/api/desktop`,
    clientId: env.EDI_DESKTOP_CLIENT_ID,
    handler: getAuth().auth.handler,
  });
}
