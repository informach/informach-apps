import { Button } from "@informach/ui/components/button";
import { FileClock } from "lucide-react";
import Link from "next/link";
import { listReadyNotices } from "@/features/notices/repository";
import { SOURCE_LABELS } from "@/features/notices/schemas";

/**
 * Importações que foram processadas mas nunca confirmadas.
 *
 * O crédito (ou uma das cinco importações de teste) já foi consumido quando o
 * recado virou `status = 'ready'`. Até esta seção existir, o rascunho só
 * aparecia em `/recados` — uma página que a família não tem motivo para
 * reabrir — então a interrupção no meio da revisão custava dinheiro e sumia da
 * vista. Aqui ele volta para a primeira tela do dia.
 *
 * Retorna `null` quando não há nada pendente: é uma seção de exceção, não um
 * item fixo da rotina.
 */
export async function PendingDraftsSection({ userId }: { userId: string }) {
  const drafts = await listReadyNotices(userId);
  if (!drafts.length) return null;

  return (
    <section
      aria-labelledby="pending-drafts-title"
      className="rounded-3xl border border-chart-4/30 bg-chart-4/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-chart-4/15 text-chart-4-ink">
          <FileClock className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="pending-drafts-title" className="text-lg font-semibold">
            Falta conferir antes de salvar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {drafts.length === 1
              ? "Uma importação ficou pela metade. Retomar não consome outro crédito."
              : `${drafts.length} importações ficaram pela metade. Retomar não consome outro crédito.`}
          </p>
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <Button
              asChild
              variant="outline"
              className="min-h-11 w-full justify-start rounded-xl border-chart-4/30 bg-background text-foreground hover:bg-chart-4/10 hover:text-foreground"
            >
              <Link href={`/recados/novo?retomar=${draft.id}`}>
                Retomar {SOURCE_LABELS[draft.source]}, de{" "}
                {draft.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
