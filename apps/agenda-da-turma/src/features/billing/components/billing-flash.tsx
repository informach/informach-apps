"use client";

import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Reads `?credits=success|canceled` and `?upgrade=pending` from the URL after
 * the user returns from a Stripe-hosted page (Checkout or hosted invoice) and
 * surfaces a clear status banner at the top of `/settings/billing`. After
 * showing it once, strips the params from the URL so a refresh doesn't keep
 * re-asserting the message.
 */
export function BillingFlash() {
  const router = useRouter();
  const params = useSearchParams();
  const credits = params.get("credits");
  const upgrade = params.get("upgrade");

  useEffect(() => {
    if (!credits && !upgrade) return;
    const t = setTimeout(() => {
      router.replace("/settings/billing");
    }, 8000);
    return () => clearTimeout(t);
  }, [credits, upgrade, router]);

  if (credits === "success") {
    return (
      <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <AlertTitle className="text-emerald-900 dark:text-emerald-100">
          Compra confirmada!
        </AlertTitle>
        <AlertDescription className="text-emerald-800/90 dark:text-emerald-200/80">
          Os créditos já estão no seu saldo.
        </AlertDescription>
      </Alert>
    );
  }
  if (credits === "canceled") {
    return (
      <Alert>
        <XCircle className="size-4" aria-hidden />
        <AlertTitle>Compra cancelada</AlertTitle>
        <AlertDescription>Nenhuma cobrança foi feita. Você pode tentar de novo.</AlertDescription>
      </Alert>
    );
  }
  if (upgrade === "pending") {
    return (
      <Alert>
        <CheckCircle2 className="size-4" aria-hidden />
        <AlertTitle>Mudança em processamento</AlertTitle>
        <AlertDescription>
          Estamos confirmando o pagamento com o Stripe. Atualize a página em alguns segundos para
          ver o novo plano.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
