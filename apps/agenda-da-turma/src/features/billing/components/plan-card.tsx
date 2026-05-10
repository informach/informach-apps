"use client";

import type { Product } from "@informach/config";
import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { CalendarClock, CreditCard, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CancelPlanDialog } from "./cancel-plan-dialog";
import { SwitchPlanDialog } from "./switch-plan-dialog";

export type PlanCardSubscription = {
  status: string;
  cancelAtPeriodEnd: Date | null;
  currentPeriodEnd: Date | null;
};

type Props = {
  subscription: PlanCardSubscription | null;
  currentProduct: Product | undefined;
  /** Sibling product on the opposite billing cycle (annual ↔ monthly). */
  alternateCycleProduct: Product | undefined;
  /** Pending product set by a scheduled downgrade, if any. */
  pendingProduct: Product | undefined;
};

export function PlanCard({
  subscription,
  currentProduct,
  alternateCycleProduct,
  pendingProduct,
}: Props) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const productName = currentProduct?.name ?? "Agenda da Turma Free";
  const status = subscription?.status ?? "free";

  const hasSub = !!subscription && status !== "canceled";
  const cancelAt = subscription?.cancelAtPeriodEnd ?? null;
  const periodEnd = subscription?.currentPeriodEnd ?? null;

  const isAnnual = currentProduct?.interval === "year";
  const switchMode: "upgrade" | "downgrade" = isAnnual ? "downgrade" : "upgrade";
  const switchLabel = isAnnual ? "Trocar para mensal" : "Trocar para anual";
  const priceLabel = currentProduct?.listPrice ? formatPrice(currentProduct.listPrice) : null;
  const intervalLabel = isAnnual ? "/ano" : "/mês";

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Plano atual</CardTitle>
        <CreditCard className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="text-2xl font-semibold tracking-tight">{productName}</div>
          {priceLabel ? (
            <div className="text-sm text-muted-foreground tabular-nums">
              {priceLabel}
              <span className="ml-0.5">{intervalLabel}</span>
            </div>
          ) : null}
          <StatusBadge status={status} cancelAt={cancelAt} />
          {pendingProduct ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden />
              Mudança para <strong className="font-medium">{pendingProduct.name}</strong> agendada
              {cancelAt ? ` para ${formatDate(cancelAt)}` : ""}.
            </p>
          ) : cancelAt ? (
            <p className="text-xs text-muted-foreground">
              Acesso garantido até {formatDate(cancelAt)}.
            </p>
          ) : periodEnd ? (
            <p className="text-xs text-muted-foreground">Renova em {formatDate(periodEnd)}.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Sem cobrança ativa.</p>
          )}
        </div>

        {hasSub && alternateCycleProduct ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSwitchOpen(true)}
              disabled={!!pendingProduct}
            >
              <RefreshCw className="mr-2 size-3.5" aria-hidden />
              {switchLabel}
            </Button>
            {!cancelAt ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
                <X className="mr-2 size-3.5" aria-hidden />
                Cancelar plano
              </Button>
            ) : null}
          </div>
        ) : !hasSub ? (
          <Button asChild size="sm">
            <Link href="/upgrade">Escolher Pro</Link>
          </Button>
        ) : null}
      </CardContent>

      {alternateCycleProduct ? (
        <SwitchPlanDialog
          open={switchOpen}
          onOpenChange={setSwitchOpen}
          mode={switchMode}
          targetProductId={alternateCycleProduct.id}
          targetProductName={alternateCycleProduct.name}
        />
      ) : null}
      {currentProduct ? (
        <CancelPlanDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          accessUntil={periodEnd}
          productName={currentProduct.name}
        />
      ) : null}
    </Card>
  );
}

function StatusBadge({ status, cancelAt }: { status: string; cancelAt: Date | null }) {
  if (status === "active" && cancelAt) {
    return <Badge variant="secondary">Cancelando no fim do período</Badge>;
  }
  const label =
    {
      active: "Ativo",
      trialing: "Teste",
      past_due: "Pagamento pendente",
      unpaid: "Em atraso",
      canceled: "Cancelado",
      incomplete: "Incompleto",
      incomplete_expired: "Expirado",
      paused: "Pausado",
      free: "Free",
    }[status] ?? status;
  return <Badge variant={status === "active" ? "default" : "secondary"}>{label}</Badge>;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatPrice(price: NonNullable<Product["listPrice"]>): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: price.currency,
  }).format(price.amountCents / 100);
}
