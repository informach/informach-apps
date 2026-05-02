import { findProduct } from "@informach/config";
import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { ArrowLeft, CreditCard, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { BillingPortalButton } from "@/features/billing/components/billing-portal-button";
import { billing } from "@/features/billing/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Plano e cobrança — Cozya",
};

export default async function BillingSettingsPage() {
  const user = await requireUserServer();
  const subject = { type: "user", id: user.id } as const;
  const [balance, subscription, history] = await Promise.all([
    billing.getBalance(subject),
    billing.getSubscription(subject),
    billing.getCreditHistory(subject, { limit: 8 }),
  ]);
  const product = subscription ? findProduct(subscription.productId) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Dashboard
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Plano e cobrança</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Acompanhe assinatura, créditos de IA e histórico recente de consumo.
          </p>
        </div>
        {subscription ? (
          <BillingPortalButton />
        ) : (
          <Button asChild>
            <Link href="/choose-plan">Escolher Pro</Link>
          </Button>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plano atual</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold tracking-tight">
              {product?.name ?? "Cozya Free"}
            </div>
            <StatusBadge status={subscription?.status ?? "free"} />
            {subscription?.currentPeriodEnd ? (
              <p className="text-xs text-muted-foreground">
                Renova em {formatDate(subscription.currentPeriodEnd)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Sem cobrança ativa.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Créditos disponíveis
            </CardTitle>
            <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatNumber(balance.available)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(balance.reserved)} reservados de {formatNumber(balance.total)} totais.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expiram em breve
            </CardTitle>
            <WalletCards className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatNumber(balance.expiringSoon.amount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {balance.expiringSoon.firstExpiresAt
                ? `Primeiro vencimento em ${formatDate(balance.expiringSoon.firstExpiresAt)}.`
                : "Nenhum crédito vencendo nos próximos 7 dias."}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Histórico de créditos</h2>
          {history.nextCursor ? (
            <span className="text-xs text-muted-foreground">Mostrando movimentações recentes</span>
          ) : null}
        </div>
        <Card className="border-border/60">
          <CardContent className="p-0">
            {history.entries.length > 0 ? (
              <div className="divide-y divide-border/70">
                {history.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto]"
                  >
                    <div>
                      <p className="font-medium">{ledgerLabel(entry.entryType)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                        {entry.productSku ? ` · ${entry.productSku}` : ""}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums">
                      {entry.amount > 0 ? "+" : ""}
                      {formatNumber(entry.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.expiresAt ? `Expira ${formatDate(entry.expiresAt)}` : "Sem expiração"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma movimentação de créditos ainda.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
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

function ledgerLabel(type: string): string {
  return (
    {
      purchase: "Compra de créditos",
      bonus_grant: "Bônus da assinatura",
      promo_grant: "Crédito promocional",
      consumption: "Uso de IA",
      refund: "Estorno",
      expiration: "Expiração",
      adjustment: "Ajuste",
    }[type] ?? type
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
