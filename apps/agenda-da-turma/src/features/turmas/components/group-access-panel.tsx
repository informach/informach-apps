"use client";
import { Button } from "@informach/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catchActionResult } from "@/lib/action-result";
import { removeGroupAdultAction, rotateGroupCodeAction } from "../group-actions";
export function GroupAccessPanel({
  turmaId,
  code,
  adults,
}: {
  turmaId: string;
  code: string;
  adults: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Convite da turma</h2>
        <p className="text-sm text-muted-foreground">
          Quem tem o código entra na turma e pode colocar uma criança nela. Mande só para famílias
          que você conhece. A turma é organizada pelas famílias, não pela escola.
        </p>
        <code className="block break-all rounded bg-muted p-3 text-lg">{code}</code>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await catchActionResult(() => rotateGroupCodeAction({ turmaId }));
            setBusy(false);
            setMessage(
              result.ok
                ? "Código renovado. O anterior não permite novos ingressos; membros atuais continuam."
                : "Não foi possível renovar.",
            );
            router.refresh();
          }}
        >
          Revogar código e gerar outro
        </Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Outros responsáveis no grupo</h2>
        {adults.map((adult) => (
          <div
            key={adult.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <span>{adult.name}</span>
            <Button variant="outline" onClick={() => setPendingRemoval(adult.id)}>
              Remover acesso
            </Button>
          </div>
        ))}
        {!adults.length ? (
          <p className="text-sm text-muted-foreground">Nenhum outro responsável entrou.</p>
        ) : null}
        {pendingRemoval ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
            <p className="text-sm">
              Remover essa família do grupo? Ela perderá acesso às atividades recebidas deste grupo.
              Atividades criadas por ela serão preservadas. O código também será renovado para
              impedir reentrada pelo convite antigo.
            </p>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await catchActionResult(() =>
                  removeGroupAdultAction({ turmaId, memberUserId: pendingRemoval }),
                );
                setBusy(false);
                setPendingRemoval(null);
                setMessage(
                  result.ok
                    ? "Acesso removido e convite antigo revogado."
                    : "Não foi possível remover o acesso.",
                );
                router.refresh();
              }}
            >
              Confirmar remoção
            </Button>
            <Button variant="ghost" onClick={() => setPendingRemoval(null)}>
              Voltar
            </Button>
          </div>
        ) : null}
      </section>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
