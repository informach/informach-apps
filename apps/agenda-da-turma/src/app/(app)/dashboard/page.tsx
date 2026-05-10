import { findProduct } from "@informach/config";
import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  getBillingBalanceForUser,
  getBillingSubscriptionForUser,
  getIsProForUser,
} from "@/features/billing/server-cache";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Dashboard — Agenda da Turma",
};

export default async function DashboardPage() {
  const user = await requireUserServer();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo de volta, {user.name ?? "responsável"}.
        </p>
      </header>

      <Suspense fallback={<BillingWidgetSkeleton />}>
        <BillingWidget userId={user.id} />
      </Suspense>
    </main>
  );
}

async function BillingWidget({ userId }: { userId: string }) {
  // Carrega em paralelo: o widget mostra plano + saldo (Pro) ou plano + CTA
  // Seja Pro (Free).
  const [isPro, subscription, balance] = await Promise.all([
    getIsProForUser(userId),
    getBillingSubscriptionForUser(userId),
    getBillingBalanceForUser(userId),
  ]);

  const product = subscription ? findProduct(subscription.productId) : undefined;
  const monthlyCap = product?.bonusCreditsPerMonth ?? 0;

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Sua conta</CardTitle>
        {isPro ? <Badge>Pro</Badge> : <Badge variant="secondary">Free</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {isPro ? (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {formatNumber(balance.available)}
                {monthlyCap > 0 ? (
                  <span className="ml-1 text-base font-normal text-muted-foreground tabular-nums">
                    / {formatNumber(monthlyCap)}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">créditos de IA disponíveis</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/billing">
                <Sparkles className="mr-2 size-4" aria-hidden />
                Comprar mais créditos
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted-foreground">
              No plano Free você tem o essencial. Vire Pro pra desbloquear créditos de IA todo mês.
            </p>
            <Button asChild size="sm">
              <Link href="/upgrade">
                <Sparkles className="mr-2 size-4" aria-hidden />
                Seja Pro
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillingWidgetSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-40" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
