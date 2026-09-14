"use client";

import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Lê `?welcome=1`, que é o `successUrl` do Checkout do Pro
 * (`features/onboarding/service.ts`). Antes ninguém lia esse parâmetro: quem
 * acabara de pagar caía num dashboard que não reconhecia a compra.
 *
 * Mesmo padrão do `BillingFlash` de `/settings/billing` — mostra uma vez e
 * limpa o parâmetro da URL para que um refresh não repita a mensagem.
 */
export function WelcomeFlash({ isPro }: { isPro: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get("welcome");
  const profileFilter = params.get("perfil");

  useEffect(() => {
    // Mesma condição do render abaixo: com outro valor nada aparece, e agendar
    // a navegação mexeria na URL sem motivo.
    if (welcome !== "1") return;
    const t = setTimeout(() => {
      // `scroll: false`: dez segundos depois a pessoa já está lendo a rotina, e
      // o padrão do router jogaria a página de volta ao topo.
      router.replace(
        profileFilter ? `/dashboard?perfil=${encodeURIComponent(profileFilter)}` : "/dashboard",
        { scroll: false },
      );
    }, 10000);
    return () => clearTimeout(t);
  }, [welcome, profileFilter, router]);

  if (welcome !== "1") return null;

  // O Stripe redireciona antes de `checkout.session.completed` chegar, então o
  // Pro pode ainda não estar valendo nesta primeira renderização. Afirmar que
  // está deixaria o banner brigando com os limites do Free logo abaixo dele.
  if (!isPro) {
    return (
      <Alert>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <AlertTitle>Confirmando seu pagamento</AlertTitle>
        <AlertDescription>
          Estamos confirmando com o Stripe. Atualize a página em alguns segundos para ver o Pro
          valendo.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-chart-2/40 bg-chart-2/10 [&>svg]:text-chart-2">
      <Sparkles className="size-4" aria-hidden />
      <AlertTitle>Assinatura Pro ativa!</AlertTitle>
      <AlertDescription>
        Tudo certo com o pagamento. Você já pode cadastrar até três crianças, dividir a rotina com
        outro adulto e usar os créditos de IA do mês.
      </AlertDescription>
    </Alert>
  );
}
