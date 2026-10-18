import { redirect } from "next/navigation";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { SignupForm } from "@/features/onboarding/components/signup-form";
import { proOfferHref } from "@/features/onboarding/signup-flow";
import { getCurrentUserServer } from "@/lib/auth";
import { safeInternalPath } from "@/lib/url";

export const metadata = {
  title: "Criar conta",
};

/**
 * `?plan=pro&cycle=anual` vem do botão do Pro na página de vendas. Antes a
 * página ignorava os dois e mandava todo mundo para a escolha de plano, que
 * abria no mensal: o anual escolhido se perdia no caminho.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; cycle?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ? safeInternalPath(params.next, "/dashboard") : null;
  const plan = params.plan === "pro" ? { cycle: parseCycleQueryParam(params.cycle) } : null;

  // Quem já entrou e escolheu o Pro na página de vendas vai para a oferta, no
  // mesmo ciclo. É também o caminho de quem recarrega a tela depois do código:
  // a conta já existe, e o ciclo não pode se perder ali.
  const user = await getCurrentUserServer();
  if (user) redirect(next ?? (plan ? proOfferHref(plan.cycle) : "/dashboard"));

  return <SignupForm next={next} plan={plan} />;
}
