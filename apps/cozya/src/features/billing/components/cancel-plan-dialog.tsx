"use client";

import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { toast } from "@informach/ui/components/sonner";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelSubscriptionAction } from "../plan-actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date when access ends (current period end). Used in the retention copy. */
  accessUntil: Date | null;
  /** Friendly product name for retention copy ("Cozya Pro"). */
  productName: string;
};

export function CancelPlanDialog({ open, onOpenChange, accessUntil, productName }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, startSubmit] = useTransition();

  const formattedDate = accessUntil
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
        accessUntil,
      )
    : null;

  const confirm = () => {
    startSubmit(async () => {
      const result = await cancelSubscriptionAction({
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        toast.error("Não foi possível cancelar.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      const until = result.value.cancelAtPeriodEnd
        ? new Intl.DateTimeFormat("pt-BR").format(new Date(result.value.cancelAtPeriodEnd))
        : "o fim do período";
      toast.success("Cancelamento agendado.", {
        description: `Você continua com acesso até ${until}.`,
      });
      onOpenChange(false);
      // router.refresh re-renders the RSC silently — keeps toast visible and
      // doesn't fall back to the Suspense skeleton like window.location.reload.
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tem certeza que quer cancelar o {productName}?</DialogTitle>
          <DialogDescription>
            {formattedDate ? (
              <>
                Você continua com acesso completo até <strong>{formattedDate}</strong>. Depois
                disso, sua conta volta ao plano gratuito e você perde os créditos mensais de IA.
              </>
            ) : (
              <>
                Sua conta volta ao plano gratuito ao fim do período atual e você perde os créditos
                mensais de IA.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-muted-foreground">
            Conta pra gente o motivo (opcional, ajuda a melhorar o Cozya)
          </label>
          <Textarea
            id="cancel-reason"
            placeholder="Ex: estou usando outra ferramenta, preço, …"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Manter plano
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Cancelar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
