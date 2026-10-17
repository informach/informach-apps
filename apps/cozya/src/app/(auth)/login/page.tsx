import { redirect } from "next/navigation";
import { LoginForm } from "@/features/onboarding/components/login-form";
import { getCurrentUserServer } from "@/lib/auth";

export const metadata = {
  title: "Entrar | Cozya",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(paramValue(params.next), "/hoje");
  const defaultEmail = safeEmailHint(paramValue(params.email));
  const user = await getCurrentUserServer();

  if (user) redirect(nextPath);

  return <LoginForm nextPath={nextPath} defaultEmail={defaultEmail} />;
}

function paramValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeInternalPath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value === "/login" || value.startsWith("/api/")) return fallback;
  return value;
}

const SAFE_EMAIL_HINT = /^[^\s<>"]{1,254}@[^\s<>"]{1,254}$/;

function safeEmailHint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SAFE_EMAIL_HINT.test(value) ? value : undefined;
}
