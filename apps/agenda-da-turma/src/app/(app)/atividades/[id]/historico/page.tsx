import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { findActivityHistory } from "@/features/activities/history-repository";
import { requireUserServer } from "@/lib/auth";

export default async function ActivityHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserServer();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const found = await findActivityHistory(user.id, id);
  if (!found) notFound();
  const { activity, history } = found;
  const value = (input: unknown) => (typeof input === "string" ? input : "não informado");
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/atividades" className="text-sm underline">
        Voltar às atividades
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{activity.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {activity.canceledAt ? "Cancelada pelo criador" : `Versão ${activity.version}`} · Sua
          conclusão individual foi preservada.
        </p>
      </header>
      {history.map(({ revision: r, name }) => (
        <article key={r.id} className="space-y-2 rounded-xl border p-5 text-sm">
          <h2 className="font-semibold">
            Versão {r.version} · {name ?? "Conta excluída"}
          </h2>
          <p>{r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          {!Object.keys(r.previous).length ? <p>Compartilhada com a turma nesta versão.</p> : null}
          {Object.keys(r.previous).length > 0 && r.previous.dueAt !== r.current.dueAt ? (
            <p>
              Prazo mudou de {value(r.previous.dueAt)} para {value(r.current.dueAt)}.
            </p>
          ) : null}
          {Object.keys(r.previous).length > 0 && r.previous.title !== r.current.title ? (
            <p>
              Título: {value(r.previous.title)} → {value(r.current.title)}
            </p>
          ) : null}
          {r.current.canceledAt ? <p>Atividade cancelada. Não é mais uma pendência.</p> : null}
          <details>
            <summary className="cursor-pointer">Observações antes e depois</summary>
            {Object.keys(r.previous).length > 0 ? (
              <p className="mt-2 whitespace-pre-wrap">Antes: {value(r.previous.description)}</p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap">Depois: {value(r.current.description)}</p>
          </details>
        </article>
      ))}
      {!history.length ? <p>Nenhuma alteração registrada.</p> : null}
    </main>
  );
}
