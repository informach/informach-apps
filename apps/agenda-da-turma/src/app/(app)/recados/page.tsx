import { FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BackButton } from "@/components/app-shell/back-button";
import { listAccessibleProfiles } from "@/features/family/access";
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
            As mensagens, anexos e fotos que viraram atividades. Cada atividade também abre o recado
            que a originou.
          </p>
        </div>
      </header>
      {drafts.length ? (
        <section className="space-y-3 rounded-xl border border-primary/30 p-4">
          <h2 className="font-semibold">Falta conferir antes de salvar</h2>
          {drafts.map((draft) => (
            <Link
              key={draft.id}
              className="block min-h-11 text-sm text-primary underline"
              href={`/recados/novo?retomar=${draft.id}`}
            >
              Retomar importação de {SOURCE_LABELS[draft.source]}, de{" "}
              {draft.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </Link>
          ))}
          <p className="text-xs text-muted-foreground">
            Retomar o resultado salvo não consome outro crédito.
          </p>
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
            <div className="flex items-center gap-2 text-primary">
              <FileText className="size-5" aria-hidden />
              <h2 className="font-semibold">{SOURCE_LABELS[row.source]}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Importado em{" "}
              {row.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
            <p className="line-clamp-3 break-words text-sm">
              {row.preview || row.attachmentName || "Original importado"}
            </p>
            <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link
                href={`/recados/${row.id}`}
                className="inline-flex min-h-11 items-center text-primary underline"
              >
                Consultar original
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
