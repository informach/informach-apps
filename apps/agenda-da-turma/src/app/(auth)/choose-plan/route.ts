import { NextResponse } from "next/server";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { proOfferHref } from "@/features/onboarding/signup-flow";

/**
 * A escolha de plano saiu do cadastro: o grátis vale por padrão e o Pro aparece
 * quando faz falta, em `/upgrade`. O endereço continua respondendo porque links
 * antigos ainda apontam para cá (a volta de um pagamento aberto antes da
 * mudança, por exemplo), e o ciclo que vier na URL segue junto.
 *
 * Rota, e não página: o `redirect()` de uma página dentro do Suspense da raiz
 * vira uma resposta 200 com refresh no HTML, e um endereço que só existe para
 * mandar adiante responde melhor com 307. A sessão quem cobra é o proxy
 * (`/choose-plan` está no `requireAuth`) e, de novo, a própria `/upgrade`.
 */
export function GET(request: Request) {
  const cycle = new URL(request.url).searchParams.get("cycle") ?? undefined;
  return NextResponse.redirect(
    new URL(proOfferHref(parseCycleQueryParam(cycle)), request.url),
    307,
  );
}
