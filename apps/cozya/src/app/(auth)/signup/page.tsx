import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { SignupForm } from "@/features/onboarding/components/signup-form";

export const metadata = {
  title: "Criar conta — Cozya",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = paramValue(params.plan);
  const cycle = parseCycleQueryParam(paramValue(params.cycle));
  const verifiedRedirectTo =
    plan === "pro"
      ? `/choose-plan?cycle=${cycle === "annual" ? "anual" : "mensal"}`
      : "/choose-plan";

  return <SignupForm verifiedRedirectTo={verifiedRedirectTo} />;
}

function paramValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
