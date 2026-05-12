"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { exportDashboardPdfDataAction } from "../actions";

type Props = {
  isPro: boolean;
  profileFilter: string | null;
};

export function ExportPdfButton({ isPro, profileFilter }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await catchActionResult(() => exportDashboardPdfDataAction({ profileFilter }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível gerar o PDF.", {
            description: "Atualize a página e tente novamente.",
          });
          return;
        }
        if (result.error.code === "SUBSCRIPTION_REQUIRED") {
          router.push("/upgrade");
          return;
        }
        toast.error("Não foi possível gerar o PDF.");
        return;
      }

      try {
        const { buildDashboardPdf } = await import("../pdf");
        await buildDashboardPdf(result.value);
      } catch {
        toast.error("Falha ao montar o PDF.", {
          description: "Tente novamente em instantes.",
        });
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending || !isPro}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      Exportar PDF
      {!isPro ? <Badge variant="secondary">Pro</Badge> : null}
    </Button>
  );
}
