import { APPS, findProduct, isStripePriceIdConfigured, PRODUCTS } from "@informach/config";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";
import { WalletCards } from "lucide-react";
import { Suspense } from "react";
import { BackButton } from "@/components/app-shell/back-button";
import { BillingFlash } from "@/features/billing/components/billing-flash";
import { BillingPortalButton } from "@/features/billing/components/billing-portal-button";
import { CreditBalanceCard } from "@/features/billing/components/credit-balance-card";
import { CreditPacksSection } from "@/features/billing/components/credit-packs-section";
import { PlanCard } from "@/features/billing/components/plan-card";
import { ReactivateBanner } from "@/features/billing/components/reactivate-banner";
import {
  getBillingBalanceForUser,
  getBillingCreditReceivedHistoryForUser,
  getBillingSubscriptionForUser,
  getIsProForUser,
} from "@/features/billing/server-cache";
import { requireUserServer } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = {
  title: "Plano e cobrança",
};

const APP_SLUG = APPS.agendaDaTurma.slug;

export default async function BillingSettingsPage() {
  const user = await requireUserServer();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <BackButton href="/dashboard" label="Voltar para Hoje" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Plano e cobrança</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              A assinatura, as leituras de recado do mês e o que já foi usado.
            </p>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-9 w-44" />}>
          <PortalButtonSlot userId={user.id} />
        </Suspense>
      </header>

      <Suspense fallback={null}>
        <BillingFlash />
      </Suspense>

      <Suspense fallback={null}>
        <ReactivateBannerSlot userId={user.id} />
      </Suspense>

      <section className="grid gap-4 md:grid-cols-3">
        <Suspense fallback={<PlanCardSkeleton />}>
          <PlanCardSlot userId={user.id} />
        </Suspense>
        <Suspense fallback={<BalanceCardSkeleton />}>
          <BalanceCardSlot userId={user.id} />
        </Suspense>
        <Suspense fallback={<ExpiringCardSkeleton />}>
          <ExpiringCard userId={user.id} />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <CreditPacksSlot userId={user.id} />
      </Suspense>

      <Suspense fallback={<HistorySkeleton />}>
        <HistorySection userId={user.id} />
      </Suspense>
    </main>
  );
}

type UserArg = { userId: string };

async function PortalButtonSlot({ userId }: UserArg) {
  const subscription = await getBillingSubscriptionForUser(userId);
  if (!subscription) return null;
  return <BillingPortalButton />;
}

async function ReactivateBannerSlot({ userId }: UserArg) {
  const subscription = await getBillingSubscriptionForUser(userId);
  if (!subscription?.cancelAtPeriodEnd || subscription.pendingProductId) return null;
  const product = findProduct(subscription.productId);
  return (
    <ReactivateBanner
      accessUntil={subscription.cancelAtPeriodEnd}
      productName={product?.name ?? "Agenda da Turma Pro"}
    />
  );
}

async function PlanCardSlot({ userId }: UserArg) {
  const subscription = await getBillingSubscriptionForUser(userId);
  const product = subscription ? findProduct(subscription.productId) : undefined;
  const pendingProduct = subscription?.pendingProductId
    ? findProduct(subscription.pendingProductId)
    : undefined;
  const alternateCycleProduct = product
    ? PRODUCTS.find(
        (p) =>
          p.app === APP_SLUG &&
          p.kind === "subscription" &&
          p.tier === product.tier &&
          p.interval !== product.interval,
      )
    : undefined;
  return (
    <PlanCard
      subscription={subscription}
      currentProduct={product}
      alternateCycleProduct={alternateCycleProduct}
      pendingProduct={pendingProduct}
    />
  );
}

async function BalanceCardSlot({ userId }: UserArg) {
  const [balance, subscription] = await Promise.all([
    getBillingBalanceForUser(userId),
    getBillingSubscriptionForUser(userId),
  ]);
  const product = subscription ? findProduct(subscription.productId) : undefined;
  const monthlyCap = product?.bonusCreditsPerMonth ?? 0;
  return (
    <CreditBalanceCard
      available={balance.available}
      total={balance.total}
      reserved={balance.reserved}
      monthlyCap={monthlyCap}
    />
  );
}

async function ExpiringCard({ userId }: UserArg) {
  const balance = await getBillingBalanceForUser(userId);
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Vencem em breve</CardTitle>
        <WalletCards className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatNumber(balance.expiringSoon.amount)}
        </div>
        <p className="text-xs text-muted-foreground">
          {balance.expiringSoon.firstExpiresAt
            ? `Primeiro vencimento em ${formatDate(balance.expiringSoon.firstExpiresAt)}.`
            : "Nenhuma leitura vencendo nos próximos 7 dias."}
        </p>
      </CardContent>
    </Card>
  );
}

async function CreditPacksSlot({ userId }: UserArg) {
  const isPro = await getIsProForUser(userId);
  if (!isPro) return null;

  const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");
  const creditPacks = PRODUCTS.filter((p) => p.app === APP_SLUG && p.kind === "credit_pack").filter(
    (p) => stripeMode === "dev" || isStripePriceIdConfigured(p.stripePriceId.prod),
  );
  return <CreditPacksSection packs={creditPacks} />;
}

async function HistorySection({ userId }: UserArg) {
  const history = await getBillingCreditReceivedHistoryForUser(userId, 8);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Leituras recebidas e usadas</h2>
        {history.nextCursor ? (
          <span className="text-xs text-muted-foreground">Mostrando entradas recentes</span>
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
                    <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                  </div>
                  <span className="font-mono tabular-nums">
                    {entry.amount > 0 ? "+" : ""}
                    {formatNumber(entry.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.expiresAt ? `Vence em ${formatDate(entry.expiresAt)}` : "Não vence"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PlanCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-48" />
      </CardContent>
    </Card>
  );
}

function BalanceCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-44" />
      </CardContent>
    </Card>
  );
}

function ExpiringCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

function HistorySkeleton() {
  return (
    <section className="space-y-3">
      <Skeleton className="h-5 w-44" />
      <Card className="border-border/60">
        <CardContent className="space-y-3 p-4">
          {["row1", "row2", "row3", "row4"].map((slot) => (
            <div key={slot} className="flex items-center justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ledgerLabel(type: string): string {
  return (
    {
      purchase: "Pacote de leituras",
      bonus_grant: "Leituras do mês, do Pro",
      promo_grant: "Leituras para experimentar",
      consumption: "Leitura usada",
      refund: "Estorno",
      expiration: "Venceram",
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
