import { redirect } from "next/navigation";
import { LoginForm } from "@/features/onboarding/components/login-form";
import { getCurrentUserServer } from "@/lib/auth";
import { safeInternalPath } from "@/lib/url";

export const metadata = {
  title: "Entrar",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = paramValue(params.next);
  const nextPath = safeInternalPath(requested, "/dashboard");
  const defaultEmail = safeEmailHint(paramValue(params.email));
  const user = await getCurrentUserServer();

  if (user) redirect(nextPath);

  // "Criar conta" só leva o destino que veio na URL (um convite, a oferta do
  // Pro). O padrão de quem entra é Hoje, e mandá-lo ao cadastro faria a conta
  // nova pular a criança e o primeiro recado (ver `afterVerification`).
  const signupHref = requested ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup";

  return <LoginForm nextPath={nextPath} signupHref={signupHref} defaultEmail={defaultEmail} />;
}

function paramValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SAFE_EMAIL_HINT = /^[^\s<>"]{1,254}@[^\s<>"]{1,254}$/;

function safeEmailHint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SAFE_EMAIL_HINT.test(value) ? value : undefined;
}
