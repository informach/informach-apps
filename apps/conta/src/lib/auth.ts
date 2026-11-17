import "server-only";
import { type CreateAuthResult, createAuth } from "@informach/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accountReturnDestination } from "@/features/auth/return";
import { emailUnsubscribeUrl, getEmails } from "./emails";
import { getEnv } from "./env";
import { reportOperationalError } from "./observability";

let instance: CreateAuthResult | undefined;
export function getAuth() {
  const env = getEnv();
  const email = getEmails();
  instance ??= createAuth({
    appName: "Minha conta",
    baseUrl: env.origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.origin],
    webSso: { role: "provider", environment: env.environment },
    twoFactor: { enabled: true, issuer: "Minha conta · Informach" },
    sendEmail: email.sendEmail,
    renderTemplate: email.renderTemplate,
    buildUnsubscribeUrl: emailUnsubscribeUrl,
    email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
    observability: { onAuditPersistenceFailure: () => reportOperationalError("auth.audit_failed") },
  });
  return instance;
}
export async function requireAccount(destination = "/") {
  const requestHeaders = await headers();
  const user = await getAuth().getCurrentUser(requestHeaders);
  if (!user) redirect(`/entrar?next=${encodeURIComponent(accountReturnDestination(destination))}`);
  if (!user.emailVerified)
    redirect(
      `/entrar?verificar=1&next=${encodeURIComponent(accountReturnDestination(destination))}`,
    );
  return user;
}
