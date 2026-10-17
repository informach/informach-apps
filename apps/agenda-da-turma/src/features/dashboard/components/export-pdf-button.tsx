"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Loader2, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { exportWeekPdfDataAction } from "../actions";

type Props = {
  /** O plano da família, e não o de quem toca: o convidado de uma casa Pro imprime. */
  isPro: boolean;
  profileFilter: string | null;
  /** Um dia da semana que o calendário está mostrando. */
  anchorIso: string;
  className?: string;
};

/** "Imprimir a semana": a semana do calendário, num PDF para a porta da geladeira. */
export function ExportPdfButton({ isPro, profileFilter, anchorIso, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        exportWeekPdfDataAction({ profileFilter, anchorIso }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível montar a semana para imprimir.", {
            description: "Atualize a página e tente de novo.",
          });
          return;
        }
        if (result.error.code === "SUBSCRIPTION_REQUIRED") {
          router.push("/upgrade?motivo=imprimir");
          return;
        }
        toast.error("Não foi possível montar a semana para imprimir.");
        return;
      }

      try {
        const { buildWeekPdf } = await import("../pdf");
        await buildWeekPdf(result.value);
      } catch {
        toast.error("Não foi possível montar o PDF.", {
          description: "Tente de novo em instantes.",
        });
      }
    });
  }

  return (
    // No grátis o botão não fica desligado: um toque leva ao Pro, que é onde a
    // semana para imprimir mora. Botão cinza sem saída é beco.
    <Button
      variant="outline"
      size="sm"
      className={cn("min-h-11", className)}
      onClick={onClick}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Printer className="size-4" aria-hidden />
      )}
      Imprimir a semana
      {!isPro ? <Badge variant="secondary">Pro</Badge> : null}
    </Button>
  );
}
