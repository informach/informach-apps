"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { reactivateSubscriptionAction } from "../plan-actions";

type Props = {
  /** Date when access would have ended. */
  accessUntil: Date;
  productName: string;
};

export function ReactivateBanner({ accessUntil, productName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(accessUntil);

  const reactivate = () => {
    startTransition(async () => {
      const result = await catchActionResult(() => reactivateSubscriptionAction({}));
      if (!result.ok) {
        toast.error("Não foi possível reativar.", {
          description: isActionRejected(result.error)
            ? "Atualize a página e tente novamente."
            : "Tente novamente em instantes.",
        });
        return;
      }
      toast.success(`${productName} reativado.`, {
        description: "Sua assinatura continua renovando normalmente.",
      });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">Plano cancelado — ativo até {formatted}.</p>
        <p className="text-muted-foreground">
          Reative agora para continuar com {productName} sem interrupção.
        </p>
      </div>
      <Button type="button" size="sm" onClick={reactivate} disabled={pending} variant="default">
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="mr-2 size-4" aria-hidden />
        )}
        Reativar
      </Button>
    </div>
  );
}
