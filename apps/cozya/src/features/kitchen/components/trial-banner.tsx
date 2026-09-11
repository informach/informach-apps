"use client";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import Link from "next/link";
import { useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { startTrialAction } from "../actions";

export function TrialBanner({
  active,
  started,
  endsAt,
}: {
  active: boolean;
  started: boolean;
  endsAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <aside
      className="rounded-2xl border border-border bg-muted/40 p-5"
      aria-label="Experimente o Cozya"
    >
      <p className="font-semibold">
        {active
          ? "Sua primeira semana começa aqui"
          : started
            ? "Continue sua rotina com o Pro"
            : "Decida a semana. Saia com as compras prontas."}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {active
          ? `Seu teste vai até ${endsAt}. Você recebeu 3 créditos de IA para experimentar. Salvar, planejar e cozinhar não consome créditos.`
          : started
            ? "Suas receitas e listas continuam disponíveis. O Pro libera novos planos e 50 créditos de IA por mês."
            : "Experimente por 14 dias, com 3 capturas de IA. Sem cartão. Depois, R$ 14,90/mês ou R$ 149/ano se você assinar."}
      </p>
      {!started ? (
        <Button
          className="mt-4 min-h-11"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await catchActionResult(() => startTrialAction({}));
              if (!result.ok)
                toast.error("Não foi possível iniciar o teste", {
                  description:
                    "É preciso verificar o e-mail e não ter usado esta demonstração antes.",
                });
              else toast.success("Seu teste começou. Salve uma receita e planeje 3 refeições.");
            })
          }
        >
          {pending ? "Iniciando…" : "Experimentar grátis"}
        </Button>
      ) : (
        <Button asChild variant="outline" className="mt-4 min-h-11">
          <Link href={active ? "/semana" : "/upgrade"}>
            {active ? "Planejar minha semana" : "Conhecer o Pro"}
          </Link>
        </Button>
      )}
    </aside>
  );
}
