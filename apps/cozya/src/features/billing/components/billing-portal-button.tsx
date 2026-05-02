"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { createBillingPortalSessionAction } from "../actions";

export function BillingPortalButton() {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await createBillingPortalSessionAction({});
      if (!result.ok) {
        if (result.error.code === "NO_CUSTOMER") {
          toast("Você ainda não tem uma assinatura ativa.", {
            description: "Escolha o Pro para habilitar o portal de cobrança.",
          });
          return;
        }
        toast.error("Não foi possível abrir o portal.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      window.location.href = result.value.url;
    });
  };

  return (
    <Button type="button" onClick={handleClick} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
      ) : (
        <ExternalLink className="mr-2 size-4" aria-hidden />
      )}
      Gerenciar no Stripe
    </Button>
  );
}
