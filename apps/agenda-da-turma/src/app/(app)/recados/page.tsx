import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { z } from "zod";
import { listAccessibleProfiles } from "@/features/family/access";
import { RoutineCard } from "@/features/notices/components/routine-card";
import { listNoticeActions, listReadyNotices } from "@/features/notices/repository";
import { SOURCE_LABELS } from "@/features/notices/schemas";
import { requireUserServer } from "@/lib/auth";
export const metadata = { title: "Providências e histórico — Agenda da Turma" };
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ historico?: string; perfil?: string; pagina?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const history = params.historico === "1";
  const profileId = z.string().uuid().safeParse(params.perfil);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const [rows, drafts, profiles] = await Promise.all([
    listNoticeActions(user.id, {
      includeFinished: history,
      profileId: profileId.success ? profileId.data : undefined,
      limit: 101,
      offset: (page - 1) * 100,
    }),
    listReadyNotices(user.id),
    listAccessibleProfiles(user.id),
  ]);
  const href = (nextPage: number, child = params.perfil ?? "", includeHistory = history) =>
    `/recados?${new URLSearchParams({ pagina: String(nextPage), ...(includeHistory ? { historico: "1" } : {}), ...(child ? { perfil: child } : {}) })}`;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {history ? "Providências e histórico" : "Providências da família"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Acompanhe o que foi combinado para cada criança.
          </p>
        </div>
        <Button asChild>
          <Link href="/recados/novo">Organizar recado</Link>
        </Button>
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
              Retomar recado de {SOURCE_LABELS[draft.source]} —{" "}
              {draft.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </Link>
          ))}
          <p className="text-xs text-muted-foreground">
            Retomar o resultado salvo não consome outro crédito.
          </p>
        </section>
      ) : null}
      <nav aria-label="Situação das providências" className="flex flex-wrap gap-4 text-sm">
        <Link
          href={href(1, params.perfil, false)}
          aria-current={!history ? "page" : undefined}
          className="min-h-11 underline"
        >
          Pendentes
        </Link>
        <Link
          href={href(1, params.perfil, true)}
          aria-current={history ? "page" : undefined}
          className="min-h-11 underline"
        >
          Incluir concluídos e cancelados
        </Link>
      </nav>
      {profiles.length > 1 ? (
        <nav aria-label="Filtrar por criança" className="flex flex-wrap gap-3 text-sm">
          <Link
            className="rounded-full border px-4 py-2"
            href={href(1, "")}
            aria-current={!params.perfil ? "page" : undefined}
          >
            Todas
          </Link>
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={href(1, p.id)}
              className="rounded-full border px-4 py-2"
              aria-current={params.perfil === p.id ? "page" : undefined}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.slice(0, 100).map((item) => (
          <RoutineCard key={item.action.id} item={item} />
        ))}
      </div>
      {!rows.length ? (
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          Ainda não há providências nesta visão. Comece com um recado ou cadastre manualmente.
        </p>
      ) : null}
      <nav aria-label="Páginas de providências" className="flex gap-4 text-sm">
        {page > 1 ? (
          <Link className="min-h-11 underline" href={href(page - 1)}>
            Página anterior
          </Link>
        ) : null}
        {rows.length > 100 ? (
          <Link className="min-h-11 underline" href={href(page + 1)}>
            Próxima página
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
