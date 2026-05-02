import { redirect } from "next/navigation";
import { LoginForm } from "@/features/onboarding/components/login-form";
import { getCurrentUserServer } from "@/lib/auth";

export const metadata = {
  title: "Entrar — Cozya",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(paramValue(params.next), "/dashboard");
  const user = await getCurrentUserServer();

  if (user) redirect(nextPath);

  return <LoginForm nextPath={nextPath} />;
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
