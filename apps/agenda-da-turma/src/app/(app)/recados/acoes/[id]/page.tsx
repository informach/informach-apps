import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EditNoticeAction } from "@/features/notices/components/edit-action";
import { OriginalNotice } from "@/features/notices/components/original-notice";
import {
  getNoticeAction,
  getNoticeActionHistory,
  getNoticeSource,
  listAssignableAdults,
} from "@/features/notices/repository";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { requireUserServer } from "@/lib/auth";
import { billing } from "@/lib/billing";

export const metadata = {
  title: "Atividade — Agenda da Turma",
  robots: { index: false, follow: false },
};
function readable(value: unknown) {
  return typeof value === "string" ? value : "não informado";
}
function readableStatus(value: unknown) {
  return value === "pending"
    ? "Pendente"
    : value === "done"
      ? "Feito em casa"
      : value === "canceled"
        ? "Cancelada"
        : readable(value);
}
export default async function NoticeActionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserServer();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const found = await getNoticeAction(user.id, id);
  if (!found) notFound();
  const { action } = found;
  const [history, source, adults, isPro, subjectOptions] = await Promise.all([
    getNoticeActionHistory(user.id, id),
    action.noticeId ? getNoticeSource(user.id, action.noticeId) : null,
    listAssignableAdults(user.id),
    billing.hasProSubscription({ type: "user", id: found.ownerUserId }),
    listSubjectOptionsByProfile(user.id),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <Link href="/atividades" className="text-sm underline">
        Voltar às atividades
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">
          {found.profileName} · versão {action.version}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{action.title}</h1>
      </header>
      <EditNoticeAction
        key={action.version}
        id={id}
        version={action.version}
        canceled={action.status === "canceled"}
        isPro={isPro}
        profiles={[{ id: action.profileId, name: found.profileName }]}
        adults={adults}
        subjectOptions={subjectOptions}
        initialValue={{
          type: action.type,
          title: action.title,
          description: action.description,
          dueAt: action.dueAt,
          dateOrigin: action.dateOrigin,
          time: action.time,
          location: action.location,
          sourceExcerpt: action.sourceExcerpt,
          subjectId: action.subjectId,
          profileSubjectId: action.profileSubjectId,
          profileId: action.profileId,
          assignedToUserId: action.assignedToUserId,
          recurrence: action.recurrence,
          reminderAt: action.reminderAt?.toISOString() ?? null,
        }}
      />
      {source ? (
        <OriginalNotice source={source} />
      ) : action.noticeId ? (
        <p className="text-sm text-muted-foreground">
          O acesso ao documento completo depende das crianças compartilhadas com você.
        </p>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de alterações</h2>
        {history.length ? (
          history.map((revision) => (
            <article key={revision.version} className="space-y-1 rounded-lg border p-4 text-sm">
              <p className="font-medium">
                Versão {revision.version} · {revision.actor ?? "Conta excluída"}
              </p>
              <p className="text-muted-foreground">
                {revision.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
              {revision.previous.dueAt !== revision.current.dueAt ? (
                <p>
                  Prazo mudou de {readable(revision.previous.dueAt)} para{" "}
                  {readable(revision.current.dueAt)}.
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
    </main>
  );
}
