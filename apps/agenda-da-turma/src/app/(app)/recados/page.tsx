import { FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BackButton } from "@/components/app-shell/back-button";
import { todayLocalIso } from "@/features/dashboard/date";
import { shortDayLabel } from "@/features/dashboard/day-labels";
import { listAccessibleProfiles } from "@/features/family/access";
import { DiscardDraftButton } from "@/features/notices/components/discard-draft-button";
import { listNoticeOriginals, listReadyNotices } from "@/features/notices/repository";
import { SOURCE_LABELS } from "@/features/notices/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Recados guardados" };
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ historico?: string; perfil?: string; pagina?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const profileId = z.string().uuid().catch("").parse(params.perfil);
  // Keep bookmarks to the former action history useful after moving the queue.
  if (params.historico === "1")
    redirect(`/atividades?situacao=all${profileId ? `&perfil=${profileId}` : ""}`);
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(params.pagina);
  const [rows, drafts, profiles] = await Promise.all([
    listNoticeOriginals(user.id, { page, profileId: profileId || undefined }),
    listReadyNotices(user.id),
    listAccessibleProfiles(user.id),
  ]);
  const href = (nextPage: number, child = profileId) =>
    `/recados?${new URLSearchParams({ pagina: String(nextPage), ...(child ? { perfil: child } : {}) })}`;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <header className="flex items-start gap-2">
        <BackButton href="/atividades" label="Voltar às atividades" />
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recados guardados</h1>
          <p className="text-sm text-muted-foreground">
            As mensagens, fotos e anexos que viraram atividades. A foto e o anexo ficam 30 dias; as
            atividades ficam.
          </p>
        </div>
      </header>
      {drafts.length ? (
        <section className="space-y-3 rounded-xl border border-primary/30 p-4">
          <h2 className="font-semibold">
            {drafts.length === 1
              ? "Um recado ficou sem conferir"
              : `${drafts.length} recados ficaram sem conferir`}
          </h2>
          {drafts.map((draft) => (
            <div key={draft.id} className="flex items-center gap-2">
              <Link
                className="flex min-h-11 min-w-0 flex-1 items-center text-sm text-primary-ink underline"
                href={`/recados/novo?retomar=${draft.id}`}
              >
                Continuar: {SOURCE_LABELS[draft.source]},{" "}
                {shortDayLabel(todayLocalIso(draft.createdAt))}
              </Link>
              <DiscardDraftButton noticeId={draft.id} label={SOURCE_LABELS[draft.source]} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Continuar não gasta outra leitura.</p>
        </section>
      ) : null}
      {profiles.length > 1 ? (
        <nav aria-label="Filtrar originais por criança" className="flex flex-wrap gap-3 text-sm">
          <Link
            className="rounded-full border px-4 py-2"
            href={href(1, "")}
            aria-current={!profileId ? "page" : undefined}
          >
            Todas
          </Link>
          {profiles.map((p) => (
            <Link
              key={p.id}
              className="rounded-full border px-4 py-2"
              href={href(1, p.id)}
              aria-current={profileId === p.id ? "page" : undefined}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.slice(0, 30).map((row) => (
          <article key={row.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-primary-ink">
              <FileText className="size-5" aria-hidden />
              <h2 className="font-semibold">{SOURCE_LABELS[row.source]}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Chegou em {shortDayLabel(todayLocalIso(row.createdAt))}
            </p>
            <p className="line-clamp-3 break-words text-sm">
              {row.preview || row.attachmentName || "Recado com anexo"}
            </p>
            <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link
                href={`/recados/${row.id}`}
                className="inline-flex min-h-11 items-center text-primary-ink underline"
              >
                Ver o recado
              </Link>
              <Link
                href={`/atividades?recado=${row.id}&situacao=all`}
                className="inline-flex min-h-11 items-center underline"
              >
                Ver atividades
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!rows.length ? (
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          Nenhum recado guardado nesta seleção. Ao adicionar uma atividade a partir de uma mensagem
          ou foto, o original fica aqui por 30 dias.
        </p>
      ) : null}
      <nav aria-label="Páginas de originais" className="flex gap-4 text-sm">
        {page > 1 ? (
          <Link className="min-h-11 underline" href={href(page - 1)}>
            Página anterior
          </Link>
        ) : null}
        {rows.length > 30 ? (
          <Link className="min-h-11 underline" href={href(page + 1)}>
            Próxima página
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
