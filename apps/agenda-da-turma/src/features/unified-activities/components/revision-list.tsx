import { isLocalIsoDate, shortDayLabel } from "@/features/dashboard/day-labels";

/**
 * Histórico de alterações, um só para as fontes que versionam.
 *
 * Havia dois renderizadores quase iguais, com palavras diferentes para a mesma
 * coisa ("Comparar detalhes" e "Observações antes e depois", "Nenhuma alteração
 * depois da criação." e "Nenhuma alteração registrada.").
 */
export type ActivityRevision = {
  version: number;
  actor: string | null;
  createdAt: Date;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
};

function readable(value: unknown) {
  return typeof value === "string" ? value : "não informado";
}

/** A data como a família lê: "qui, 22", nunca a forma do banco. */
function readableDay(value: unknown) {
  return typeof value === "string" && isLocalIsoDate(value) ? shortDayLabel(value) : "sem data";
}

function readableStatus(value: unknown) {
  if (value === "pending") return "Em aberto";
  if (value === "done") return "Feito";
  if (value === "canceled") return "Cancelada";
  return readable(value);
}

const WHEN = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function ActivityRevisionList({ revisions }: { revisions: ActivityRevision[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Histórico de alterações</h2>
      {revisions.length ? (
        revisions.map((revision) => (
          <article key={revision.version} className="space-y-1 rounded-lg border p-4 text-sm">
            <p className="font-medium">
              Versão {revision.version} · {revision.actor ?? "Conta excluída"}
            </p>
            <p className="text-muted-foreground">{WHEN.format(revision.createdAt)}</p>
            {revision.previous.dueAt !== revision.current.dueAt ? (
              <p>
                A data mudou de {readableDay(revision.previous.dueAt)} para{" "}
                {readableDay(revision.current.dueAt)}.
              </p>
            ) : null}
            {revision.previous.title !== revision.current.title ? (
              <p>
                Título: {readable(revision.previous.title)} → {readable(revision.current.title)}
              </p>
            ) : null}
            {revision.previous.status !== revision.current.status ? (
              <p>
                Situação: {readableStatus(revision.previous.status)} →{" "}
                {readableStatus(revision.current.status)}
              </p>
            ) : null}
            {revision.current.canceledAt ? (
              <p>Atividade cancelada. Saiu da lista do que falta.</p>
            ) : null}
            <details>
              <summary className="cursor-pointer">Comparar detalhes</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p className="whitespace-pre-wrap">
                  Antes: {readable(revision.previous.description)}
                </p>
                <p className="whitespace-pre-wrap">
                  Depois: {readable(revision.current.description)}
                </p>
              </div>
            </details>
          </article>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma alteração depois da criação.</p>
      )}
    </section>
  );
}
