"use client";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { useState, useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import {
  addShoppingExtraAction,
  generateShoppingAction,
  removeShoppingExtraAction,
  setShoppingStateAction,
} from "../actions";
import { CATEGORIES } from "../ingredients";
import type { ShoppingItem as Item } from "../types";

export function ShoppingList({
  listId,
  week,
  items,
  canPlan,
}: {
  listId: string;
  week: string;
  items: Item[];
  canPlan: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const remaining = items.filter((item) => item.state === "todo").length;
  const update = (item: Item, state: Item["state"]) =>
    startTransition(async () => {
      const result = await catchActionResult(() => setShoppingStateAction({ id: item.id, state }));
      if (!result.ok) toast.error("A marcação não foi salva. Tente novamente.");
    });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {remaining} de {items.length} itens para comprar
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!canPlan || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() => generateShoppingAction({ week }));
                if (!result.ok) toast.error("Não foi possível atualizar a lista.");
                else
                  toast.success(
                    "Lista atualizada. Quantidades que mudaram voltaram para pendentes.",
                  );
              })
            }
          >
            Atualizar da semana
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Marque o que já tem em casa antes de sair. Ao mudar o plano ou uma receita, atualize a
        lista.
      </p>
      {items.length === 0 && (
        <p className="rounded-xl border p-5">
          Ainda não há ingredientes. Escolha receitas na semana ou adicione itens abaixo.
        </p>
      )}
      {Object.entries(CATEGORIES).map(([category, title]) => {
        const group = items.filter((item) => item.category === category);
        if (!group.length) return null;
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <ul className="divide-y rounded-2xl border border-border">
              {group.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className={item.state === "todo" ? "" : "text-muted-foreground"}>
                    <p className={item.state === "todo" ? "font-medium" : "line-through"}>
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm font-medium">{item.amount}</p>
                    {item.note && (
                      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{item.note}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap shrink-0 gap-2 print:hidden">
                    <Button
                      variant={item.state === "have" ? "secondary" : "outline"}
                      className="min-h-11"
                      aria-pressed={item.state === "have"}
                      disabled={pending}
                      onClick={() => update(item, item.state === "have" ? "todo" : "have")}
                    >
                      Já tenho
                    </Button>
                    <Button
                      variant={item.state === "bought" ? "secondary" : "outline"}
                      className="min-h-11"
                      aria-pressed={item.state === "bought"}
                      disabled={pending}
                      onClick={() => update(item, item.state === "bought" ? "todo" : "bought")}
                    >
                      Comprei
                    </Button>
                    {item.key.startsWith("manual:") && (
                      <Button
                        variant="ghost"
                        className="min-h-11"
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
                        Remover
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <form
        className="space-y-3 rounded-2xl border p-5 print:hidden"
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
        <h2 className="font-semibold">Algo mais para a casa?</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
          <div className="space-y-2">
            <Label htmlFor="extra-name">Item</Label>
            <Input
              id="extra-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Ex.: café"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extra-amount">Quantidade</Label>
            <Input
              id="extra-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              maxLength={80}
              placeholder="Ex.: 1 pacote"
            />
          </div>
          <Button type="submit" disabled={pending} className="min-h-11 self-end">
            Adicionar
          </Button>
        </div>
      </form>
    </div>
  );
}
