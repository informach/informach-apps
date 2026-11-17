import "server-only";
import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { safeDestination } from "./destination";
import { buildUnsubscribeUrl, emails } from "./emails";
import { env } from "./env";
import { authObservability } from "./observability";

export const authResult = createAuth({
  appName: "Dia de Estrela",
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  webSso: {
    role: "client",
    app: "dia-de-estrela",
    environment: webSsoEnvironment("dia-de-estrela", env.NEXT_PUBLIC_APP_URL),
  },
  observability: authObservability,
  rateLimitRules: { "/sign-in/social": { window: 60, max: 10 } },
  email: { verification: "link", signIn: { magicLink: false }, forgetPassword: "link" },
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl,
});

export const { auth } = authResult;
const helpers = createServerHelpers(authResult, { signInPath: "/entrar" });
export const getCurrentUser = cache(helpers.getCurrentUserServer);
export const getSession = cache(helpers.getServerSession);
export const requireUser = helpers.requireUserServer;
export async function requirePageUser(next?: string) {
  const destination = safeDestination(next ?? (await headers()).get("x-estrela-path"));
  const user = await helpers.redirectIfUnauthenticated(destination);
  if (!user.emailVerified) redirect(`/entrar?confirmar=1&next=${encodeURIComponent(destination)}`);
  return user;
}
