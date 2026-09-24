"use client";

import { Button } from "@informach/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@informach/ui/components/sheet";
import { CloudUpload, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { noticeErrorMessage } from "@/features/notices/messages";
import { discardPendingWrite, flushPendingWrites } from "../client";
import { useQueueOwner } from "../owner";
import type { PendingWrite } from "../queue";

const ACTION_LABEL: Record<PendingWrite["status"], string> = {
  done: "Marcar como feita",
  pending: "Reabrir",
};

/**
 * O que não subiu, em lista, com uma saída para cada linha.
 *
 * Esta tela é metade do que torna a fila honesta. A outra metade é o endpoint
 * idempotente: sem ele repetir grava duas vezes, sem ela a pessoa não tem como
 * saber que existe algo repetindo. Uma fila que engole em silêncio é pior do
 * que não ter fila, porque some com a conclusão E com o aviso.
 *
 * Quem recusou foi o servidor, e a decisão de insistir ou desistir fica com
 * quem lê: "Abrir atividade" mostra como ela está agora, "Descartar" tira a
 * gravação do aparelho. Não há reenvio automático do que já foi recusado —
 * seria decidir por quem mudou a atividade do outro lado.
 */
export function PendingWritesSheet({
  entries,
  open,
  onOpenChange,
}: {
  entries: PendingWrite[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const owner = useQueueOwner();
  const [busy, startTransition] = useTransition();
  const conflicts = entries.filter((entry) => entry.state === "conflict");
  const waiting = entries.filter((entry) => entry.state !== "conflict");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Mudanças que ainda não subiram</SheetTitle>
          <SheetDescription>
            Ficam guardadas neste aparelho e sobem sozinhas quando a rede voltar.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-6">
          {conflicts.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-bold">Precisam de você</h3>
              {conflicts.map((entry) => (
                <article
                  key={entry.key}
                  className="rounded-2xl border border-chart-4/40 bg-chart-4/10 p-3"
                >
                  <p className="flex items-start gap-2 text-sm font-semibold">
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0 text-chart-4-ink"
                      aria-hidden
                    />
                    <span className="min-w-0 break-words">
                      {ACTION_LABEL[entry.status]}: {entry.title}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-foreground/80">
                    {noticeErrorMessage(entry.errorCode ?? "")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm" className="min-h-11">
                      <Link
                        href={`/atividades/${entry.taskId}`}
                        onClick={() => onOpenChange(false)}
                      >
                        Abrir atividade
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          await discardPendingWrite(entry.key);
                          // Desistir devolve o card ao que o servidor diz: sem
                          // isto ele ficaria mostrando a decisão descartada.
                          router.refresh();
                        })
                      }
                    >
                      Descartar
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {waiting.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-bold">Esperando a rede</h3>
              <ul className="space-y-2">
                {waiting.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-start gap-2 rounded-2xl border bg-card p-3 text-sm"
                  >
                    <CloudUpload
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 break-words">
                      {ACTION_LABEL[entry.status]}: {entry.title}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="min-h-11 w-full"
                disabled={busy || !owner}
                onClick={() =>
                  startTransition(async () => {
                    if (!owner) return;
                    if ((await flushPendingWrites(owner)).sent > 0) router.refresh();
                  })
                }
              >
                Tentar agora
              </Button>
            </section>
          ) : null}

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada esperando. Tudo já subiu.</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
