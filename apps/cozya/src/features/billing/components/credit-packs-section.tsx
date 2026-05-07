"use client";

import type { Product } from "@informach/config";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { toast } from "@informach/ui/components/sonner";
import { Loader2, ShoppingCart, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { purchaseCreditPackAction } from "../plan-actions";

type Props = {
  packs: readonly Product[];
};

export function CreditPacksSection({ packs }: Props) {
  if (packs.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Comprar créditos</h2>
        <p className="text-sm text-muted-foreground">
          Pacotes avulsos que se somam ao saldo. Não expiram.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {packs.map((pack) => (
          <PackCard key={pack.id} pack={pack} />
        ))}
      </div>
    </section>
  );
}

function PackCard({ pack }: { pack: Product }) {
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const buy = () => {
    setActiveId(pack.id);
    startTransition(async () => {
      const result = await catchActionResult(() =>
        purchaseCreditPackAction({ productId: pack.id }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível iniciar a compra.", {
            description: "Atualize a página e tente novamente.",
          });
        } else if (result.error.code === "NO_PRO_SUBSCRIPTION") {
          // Defense-in-depth: the section is hidden for non-Pro users by the
          // page (`CreditPacksSlot` returns null), but if local/Stripe state
          // diverges and a non-Pro hits this code path, show a clean message
          // instead of a generic "couldn't start purchase".
          toast("Disponível só para assinantes Pro.", {
            description: "Assine o Cozya Pro para comprar pacotes de crédito.",
          });
        } else if (result.error.code === "PACK_NOT_CONFIGURED") {
          toast("Pacote ainda não disponível.", {
            description: "Estamos finalizando a configuração — tente em breve.",
          });
        } else {
          toast.error("Não foi possível iniciar a compra.", {
            description: "Tente novamente em instantes.",
          });
        }
        setActiveId(null);
        return;
      }
      window.location.href = result.value.url;
    });
  };

  const credits = pack.creditAmount ?? 0;
  const priceLabel = pack.listPrice ? formatPrice(pack.listPrice) : null;
  const isLoading = pending && activeId === pack.id;

  return (
    <Card className="border-border/60">
      {/* Header carries the pack identity (e.g. "20 créditos"). Body focuses
          on the single figure the user needs to decide: total price. Button
          stays a plain CTA — the price is right above it. */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{pack.name}</CardTitle>
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {priceLabel ?? `+${new Intl.NumberFormat("pt-BR").format(credits)} créditos`}
        </div>
        <Button type="button" size="sm" onClick={buy} disabled={pending} className="w-full">
          {isLoading ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <ShoppingCart className="mr-2 size-4" aria-hidden />
          )}
          Comprar
        </Button>
      </CardContent>
    </Card>
  );
}

function formatPrice(price: NonNullable<Product["listPrice"]>): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: price.currency,
  }).format(price.amountCents / 100);
}
