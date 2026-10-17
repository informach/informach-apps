"use client";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Check, Printer, RefreshCw, Send, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import {
  addShoppingExtraAction,
  generateShoppingAction,
  removeShoppingExtraAction,
  setShoppingStateAction,
} from "../actions";
import { recordListSharedAction } from "../event-actions";
import { CATEGORIES, type ShoppingCategory, shoppingCategory } from "../ingredients";
import { buildShoppingWhatsappUrl } from "../share-list";
import type { ShoppingItem as Item } from "../types";

type Phase = "antes" | "mercado";
const AISLES = (Object.keys(CATEGORIES) as ShoppingCategory[]).filter(
  (category) => category !== "despensa",
);

export function ShoppingList({
  listId,
  week,
  weekLabel,
  subtitle,
  items,
  canPlan,
  stale,
  initialPhase,
}: {
  listId: string;
  week: string;
  weekLabel: string;
  /** "16 itens para 5 refeições · 19 a 25 de outubro" */
  subtitle: string;
  items: Item[];
  canPlan: boolean;
  stale: boolean;
  initialPhase: Phase;
}) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [optimistic, applyOptimistic] = useOptimistic(
    items,
    (current, change: { id: string; state: Item["state"] }) =>
      current.map((item) => (item.id === change.id ? { ...item, state: change.state } : item)),
  );

  const choosePhase = (next: Phase) => {
    setPhase(next);
    // Remember the phase across reloads without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("fase", next);
    window.history.replaceState(null, "", url);
  };
  const update = (item: Item, state: Item["state"]) =>
    startTransition(async () => {
      applyOptimistic({ id: item.id, state });
      const result = await catchActionResult(() => setShoppingStateAction({ id: item.id, state }));
      if (!result.ok) toast.error("A marcação não foi salva. Tente de novo.");
    });
  const toggle = (item: Item) => {
    if (phase === "antes") update(item, item.state === "todo" ? "have" : "todo");
    else update(item, item.state === "bought" ? "todo" : "bought");
  };

  const pantry = optimistic.filter((item) => shoppingCategory(item.category) === "despensa");
  const aisles = optimistic.filter((item) => shoppingCategory(item.category) !== "despensa");
  const toFetch = aisles.filter((item) => item.state !== "have");
  const atHome = aisles.length - toFetch.length;
  const picked = toFetch.filter((item) => item.state === "bought").length;
  const missingPantry = pantry.filter((item) => item.state === "todo").length;
  const status =
    phase === "antes"
      ? `Toque no que já tem em casa. ${atHome} ${atHome === 1 ? "item já está" : "itens já estão"} em casa.`
      : [
          `${picked} de ${toFetch.length} no carrinho`,
          missingPantry ? `mais ${missingPantry} da despensa` : null,
          atHome ? `${atHome} já em casa` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const row = (item: Item) => {
    const home = item.state === "have";
    const bought = item.state === "bought";
    const done = phase === "antes" ? home || bought : bought;
    const manual = item.key.startsWith("manual:");
    return (
      <li key={item.id} className="flex items-center border-b border-border/80 last:border-b-0">
        <button
          type="button"
          data-print="keep"
          aria-pressed={done}
          disabled={!hydrated}
          onClick={() => toggle(item)}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
              done
                ? home && phase === "antes"
                  ? "border-sage-soft bg-sage-soft text-sage-ink"
                  : "border-sage bg-sage text-white dark:text-background"
                : "border-input text-transparent",
            )}
          >
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-base leading-snug",
                bought && "text-muted-foreground line-through",
                home && phase === "antes" && "text-muted-foreground",
              )}
            >
              {item.name}
            </span>
            {item.note && item.note !== "Adicionado por você" && (
              <span className="block text-xs leading-snug text-muted-foreground">{item.note}</span>
            )}
          </span>
          {home && phase === "antes" && (
            <span className="shrink-0 text-[11px] font-extrabold tracking-[0.04em] text-sage-ink">
              EM CASA
            </span>
          )}
          <span className="shrink-0 text-right text-sm font-bold text-muted-foreground">
            {item.amount}
          </span>
        </button>
        {manual && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground print:hidden"
            disabled={pending}
            aria-label={`Remover ${item.name}`}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() =>
                  removeShoppingExtraAction({ id: item.id }),
                );
                if (!result.ok) toast.error("Não foi possível remover o item.");
              })
            }
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-display md:text-4xl">
            Lista do mercado
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="shrink-0 print:hidden">
          <Button asChild variant="outline" size="icon" className="size-11 rounded-xl bg-card">
            <a
              href={buildShoppingWhatsappUrl(weekLabel, optimistic)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Mandar a lista pelo WhatsApp"
              onClick={() => void catchActionResult(() => recordListSharedAction({ week }))}
            >
              <Send className="size-5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>

      {stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-peach p-4 text-peach-ink print:hidden"
        >
          <p className="font-bold">A semana mudou desde que a lista foi montada.</p>
          <Button
            className="min-h-11 bg-secondary text-secondary-foreground hover:bg-secondary/90"
            disabled={!hydrated || pending || !canPlan}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() => generateShoppingAction({ week }));
                if (!result.ok) toast.error("Não foi possível atualizar a lista.");
                else
                  toast.success("Lista atualizada. Quantidades que mudaram voltaram para pegar.");
              })
            }
          >
            <RefreshCw className="size-4" aria-hidden />
            Atualizar a lista
          </Button>
        </div>
      )}

      <fieldset className="grid grid-cols-2 rounded-[14px] bg-muted p-1 print:hidden">
        <legend className="sr-only">Fase da compra</legend>
        {(["antes", "mercado"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={phase === value}
            disabled={!hydrated}
            onClick={() => choosePhase(value)}
            className={cn(
              "min-h-11 rounded-[10px] text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              phase === value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {value === "antes" ? "Antes de sair" : "No mercado"}
          </button>
        ))}
      </fieldset>
      <p role="status" className="text-[15px] leading-snug font-bold print:hidden">
        {status}
      </p>

      {optimistic.length === 0 && (
        <p className="rounded-2xl bg-muted p-5">
          As refeições desta semana não pedem nada do mercado. Adicione itens abaixo, se quiser.
        </p>
      )}

      {AISLES.map((category) => {
        const group = aisles.filter(
          (item) =>
            shoppingCategory(item.category) === category &&
            (phase === "antes" || item.state !== "have"),
        );
        if (!group.length) return null;
        return (
          <section key={category} aria-label={CATEGORIES[category]}>
            <h2 className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              {CATEGORIES[category]}
            </h2>
            <ul>{group.map(row)}</ul>
          </section>
        );
      })}

      {phase === "mercado" && missingPantry > 0 && (
        <section aria-label="Da despensa">
          <h2 className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            Da despensa
          </h2>
          <ul>{pantry.filter((item) => item.state !== "have").map(row)}</ul>
        </section>
      )}

      {pantry.length > 0 && phase === "antes" && (
        <section
          aria-labelledby="despensa"
          className={cn(
            "space-y-3 rounded-2xl bg-muted p-4",
            missingPantry === 0 && "print:hidden",
          )}
        >
          <h2 id="despensa" className="text-[15px] font-bold">
            Na despensa. Tem tudo?{" "}
            <span className="font-medium text-muted-foreground">Toque no que falta.</span>
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {pantry.map((item) => {
              const missing = item.state === "todo";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-print={missing ? "keep" : undefined}
                    aria-pressed={missing}
                    disabled={!hydrated}
                    title={item.amount}
                    onClick={() => update(item, missing ? "have" : "todo")}
                    className={cn(
                      "min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      missing
                        ? "border-peach-line bg-peach text-peach-ink"
                        : "border-border bg-card text-foreground",
                    )}
                  >
                    {item.name}
                    {missing ? " · falta" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="print:hidden">
        {adding ? (
          <form
            className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await catchActionResult(() =>
                  addShoppingExtraAction({ listId, name, amount }),
                );
                if (!result.ok) toast.error("Não foi possível adicionar o item.");
                else {
                  setName("");
                  setAmount("");
                  toast.success("Item adicionado");
                }
              });
            }}
          >
            <h2 className="font-bold">Algo mais para a casa?</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
              <div className="space-y-2">
                <Label htmlFor="extra-name">Item</Label>
                <Input
                  id="extra-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={120}
                  placeholder="Ex.: café"
                  className="h-11 bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra-amount">Quantidade</Label>
                <Input
                  id="extra-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  maxLength={80}
                  placeholder="Ex.: 1 pacote"
                  className="h-11 bg-card"
                />
              </div>
              <Button type="submit" disabled={pending} className="min-h-11 self-end">
                Adicionar
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-12 w-full rounded-2xl border-[1.5px] border-dashed border-input text-[15px] font-bold outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Algo mais para a casa
          </button>
        )}
      </div>
      <div className="flex justify-center print:hidden">
        <Button
          variant="ghost"
          className="min-h-11 font-bold underline-offset-4 hover:underline"
          onClick={() => window.print()}
        >
          <Printer className="size-4" aria-hidden />
          Imprimir a lista
        </Button>
      </div>
    </div>
  );
}
