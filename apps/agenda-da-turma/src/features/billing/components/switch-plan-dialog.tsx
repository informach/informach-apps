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
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { previewPlanChangeAction, switchToPlanAction } from "../plan-actions";

type Mode = "upgrade" | "downgrade";

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      subtotalCents: number;
      amountDueCents: number;
      prorationCreditCents: number;
      currency: string;
      nextChargeAt: string | null;
    }
  | { kind: "error"; message: string };

type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "applying" }
  | { phase: "done"; mode: "immediate" | "scheduled"; appliesAt: string | null }
  | { phase: "redirecting"; targetUrl: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  targetProductId: string;
  targetProductName: string;
};

export function SwitchPlanDialog({
  open,
  onOpenChange,
  mode,
  targetProductId,
  targetProductName,
}: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });
  const [, startSubmit] = useTransition();

  useEffect(() => {
    if (!open) {
      setPreview({ kind: "idle" });
      setSubmit({ phase: "idle" });
      return;
    }
    if (mode === "downgrade") {
      setPreview({ kind: "idle" });
      return;
    }
    setPreview({ kind: "loading" });
    let canceled = false;
    void (async () => {
      const result = await catchActionResult(() =>
        previewPlanChangeAction({ productId: targetProductId }),
      );
      if (canceled) return;
      if (!result.ok) {
        setPreview({
          kind: "error",
          message:
            !isActionRejected(result.error) && result.error.code === "NO_SUBSCRIPTION"
              ? "Você não tem uma assinatura para alterar."
              : "Não conseguimos calcular o valor da mudança.",
        });
        return;
      }
      setPreview({
        kind: "ready",
        subtotalCents: result.value.subtotalCents,
        amountDueCents: result.value.amountDueCents,
        prorationCreditCents: result.value.prorationCreditCents,
        currency: result.value.currency,
        nextChargeAt: result.value.nextChargeAt,
      });
    })();
    return () => {
      canceled = true;
    };
  }, [open, mode, targetProductId]);

  useEffect(() => {
    if (submit.phase !== "done") return;
    const t = setTimeout(() => {
      onOpenChange(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [submit.phase, onOpenChange]);

  useEffect(() => {
    if (submit.phase !== "redirecting") return;
    const t = setTimeout(() => {
      window.location.href = submit.targetUrl;
    }, 600);
    return () => clearTimeout(t);
  }, [submit]);

  const submitting =
    submit.phase === "submitting" || submit.phase === "applying" || submit.phase === "redirecting";

  const confirm = () => {
    setSubmit({ phase: "submitting" });
    startSubmit(async () => {
      const result = await catchActionResult(() =>
        switchToPlanAction({ productId: targetProductId }),
      );
      if (!result.ok) {
        setSubmit({ phase: "idle" });
        toast.error("Não foi possível alterar o plano.", {
          description:
            !isActionRejected(result.error) && result.error.code === "ALREADY_ON_PLAN"
              ? "Você já está neste plano."
              : "Tente novamente em instantes.",
        });
        return;
      }
      if (result.value.appliedImmediately && result.value.paymentActionUrl) {
        setSubmit({ phase: "redirecting", targetUrl: result.value.paymentActionUrl });
        return;
      }

      setSubmit({ phase: "applying" });
      router.refresh();
      setSubmit({
        phase: "done",
        mode: result.value.appliedImmediately ? "immediate" : "scheduled",
        appliesAt: result.value.appliesAt,
      });
    });
  };

  const phase = submit.phase;
  const showPreview = phase === "idle" || phase === "submitting";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {phase === "done"
              ? submit.mode === "immediate"
                ? "Plano atualizado"
                : "Mudança agendada"
              : phase === "redirecting"
                ? "Confirme o pagamento no Stripe"
                : phase === "applying"
                  ? "Aplicando mudança…"
                  : mode === "upgrade"
                    ? "Trocar para anual"
                    : "Trocar para mensal"}
          </DialogTitle>
          <DialogDescription>
            {phase === "done" ? (
              submit.mode === "immediate" ? (
                <>
                  Você já está no <strong>{targetProductName}</strong>.
                </>
              ) : (
                <>
                  Você passa para <strong>{targetProductName}</strong> em{" "}
                  {submit.appliesAt ? formatDate(submit.appliesAt) : "o fim do período atual"}.
                </>
              )
            ) : phase === "redirecting" ? (
              <>
                Sua nova fatura está pronta. Você será levado em instantes para uma página segura do
                Stripe para confirmar o pagamento.
              </>
            ) : phase === "applying" ? (
              <>Estamos confirmando a mudança com o Stripe…</>
            ) : mode === "upgrade" ? (
              <>
                Você vai mudar para <strong>{targetProductName}</strong> agora. Cobramos a diferença
                proporcional e você passa a pagar uma vez por ano.
              </>
            ) : (
              <>
                Você vai passar para <strong>{targetProductName}</strong> no fim do período atual —
                sem custo extra agora. Você continua aproveitando o anual até essa data.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {showPreview && mode === "upgrade" && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
            {preview.kind === "loading" ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Calculando proporcional…
              </div>
            ) : preview.kind === "error" ? (
              <p className="text-destructive">{preview.message}</p>
            ) : preview.kind === "ready" ? (
              <PreviewBody
                planName={targetProductName}
                subtotalCents={preview.subtotalCents}
                amountDueCents={preview.amountDueCents}
                prorationCreditCents={preview.prorationCreditCents}
                currency={preview.currency}
                nextChargeAt={preview.nextChargeAt}
              />
            ) : null}
          </div>
        )}

        {phase === "applying" && (
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">
              Atualizando seus dados — isso leva só alguns segundos.
            </span>
          </div>
        )}

        {phase === "redirecting" && (
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Abrindo a página de pagamento…</span>
          </div>
        )}

        {phase === "done" && (
          <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="text-emerald-900 dark:text-emerald-100">
              {submit.mode === "immediate"
                ? "Cobrança proporcional efetuada e plano ativado."
                : "Vamos te avisar quando a mudança virar."}
            </span>
          </div>
        )}

        <DialogFooter>
          {phase === "done" ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={confirm} disabled={submitting}>
                {submit.phase === "submitting" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="mr-2 size-4" aria-hidden />
                )}
                {mode === "upgrade" ? "Confirmar e cobrar agora" : "Agendar mudança"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody(props: {
  planName: string;
  subtotalCents: number;
  amountDueCents: number;
  prorationCreditCents: number;
  currency: string;
  nextChargeAt: string | null;
}) {
  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: props.currency,
    }).format(cents / 100);
  const nextDate = props.nextChargeAt
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
        new Date(props.nextChargeAt),
      )
    : null;
  const hasProrationCredit = props.prorationCreditCents < 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{props.planName}</span>
        <span className="tabular-nums">{formatCurrency(props.subtotalCents)}</span>
      </div>
      {hasProrationCredit ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Crédito proporcional do plano atual</span>
          <span className="tabular-nums">{formatCurrency(props.prorationCreditCents)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-border/60 pt-2">
        <span className="font-medium">Cobrança agora</span>
        <strong className="text-base tabular-nums">{formatCurrency(props.amountDueCents)}</strong>
      </div>
      {nextDate ? (
        <div className="text-xs text-muted-foreground">Próxima cobrança em {nextDate}.</div>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
