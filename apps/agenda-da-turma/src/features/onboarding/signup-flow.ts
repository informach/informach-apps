import { type BillingCycle, parseCycleQueryParam } from "@/features/billing/plans-content";

/**
 * Para onde o cadastro vai depois que o código do e-mail confere.
 *
 * Antes era sempre a escolha de plano, e o Pro anual escolhido na página de
 * vendas se perdia ali: a tela abria no mensal. Agora o plano sai do cadastro.
 *
 * - O convite de outro adulto (`?next=/familia/convite…`) vai direto para ele:
 *   quem foi convidado não cadastra criança, entra na casa de quem convidou.
 * - Quem escolheu o Pro na página de vendas vai direto ao pagamento, no ciclo
 *   que escolheu. Vale também quando o Pro chega pelo login, como
 *   `?next=/upgrade?cycle=anual`.
 * - O resto cadastra a criança. Qualquer outro destino (o proxy põe `?next=` em
 *   toda rota protegida, inclusive Hoje) vem depois dela, porque uma conta nova
 *   sem criança é a conta que parece resolvida e não tem nada. Sem destino, o
 *   cadastro termina no primeiro recado.
 */
export type AfterVerification =
  | { kind: "next"; href: string }
  | { kind: "checkout"; cycle: BillingCycle }
  | { kind: "child"; continueTo: string | null };

const ADULT_INVITE = "/familia/convite";
const PRO_OFFER = "/upgrade";
/** Para onde a pessoa iria de qualquer jeito: não é um destino a preservar. */
const HOME = "/dashboard";

function parsePath(path: string) {
  return new URL(path, "http://interno.invalid");
}

export function afterVerification(input: {
  next: string | null;
  plan: { cycle: BillingCycle } | null;
}): AfterVerification {
  const next = input.next ? parsePath(input.next) : null;
  if (input.next && next?.pathname === ADULT_INVITE) return { kind: "next", href: input.next };
  if (input.plan) return { kind: "checkout", cycle: input.plan.cycle };
  const cycle = next?.pathname === PRO_OFFER ? next.searchParams.get("cycle") : null;
  if (cycle) return { kind: "checkout", cycle: parseCycleQueryParam(cycle) };
  return { kind: "child", continueTo: input.next && next?.pathname !== HOME ? input.next : null };
}

/** As etapas que a pessoa vê no topo, conforme o caminho. */
export function signupSteps(path: AfterVerification): string[] {
  if (path.kind === "next") return ["Conta", "Código"];
  if (path.kind === "checkout") return ["Conta", "Código", "Pagamento"];
  return path.continueTo
    ? ["Conta", "Código", "Criança"]
    : ["Conta", "Código", "Criança", "Recado"];
}

/**
 * A oferta do Pro no ciclo escolhido. É para onde vai quem escolheu o Pro e já
 * tem conta (entrou pelo login, recarregou depois do código, cancelou o
 * pagamento): em todos esses caminhos o ciclo viaja junto, porque foi
 * justamente aí que o anual se perdia.
 */
export function proOfferHref(cycle: BillingCycle): string {
  return `${PRO_OFFER}?cycle=${cycle === "annual" ? "anual" : "mensal"}`;
}
