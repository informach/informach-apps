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
    // Clean the URL once we've read the flag.
    const t = setTimeout(() => {
      router.replace("/settings/billing");
    }, 8000);
    return () => clearTimeout(t);
  }, [credits, upgrade, router]);

  if (credits === "success") {
    return (
      <Alert className="border-success/40 bg-success/10 [&>svg]:text-success">
        <CheckCircle2 className="size-4" aria-hidden />
        <AlertTitle>Compra confirmada!</AlertTitle>
        <AlertDescription>Os créditos já estão no seu saldo.</AlertDescription>
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
