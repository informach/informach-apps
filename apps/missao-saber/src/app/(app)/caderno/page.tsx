import Link from "next/link";
import { EmptyProfile } from "@/components/empty-profile";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { Notebook } from "@/features/learning/components/notebook";
import { notebookPage, readNoteContext } from "@/features/learning/repository";
import { notebookQuerySchema } from "@/features/learning/schemas";
import { requirePageUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Caderno" };

export default async function Notes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const user = await requirePageUser();
  const parsed = notebookQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert">
        Este endereço do caderno contém um filtro inválido.{" "}
        <Link className="underline" href="/caderno">
          Voltar ao início do caderno
        </Link>
      </p>
    );
  const query = parsed.data;
  const result = await (async () => {
    try {
      const notes = await notebookPage(user.id, data.profile.id, {
        archived: query.archived === "1",
        search: query.q,
        cursor: query.after,
      });
      const context = query.session
        ? await readNoteContext(user.id, data.profile.id, query.session, query.item)
        : undefined;
      return { notes, context };
    } catch (error) {
      if (
        error instanceof AppError &&
        ["CURSOR", "PROFILE", "NOT_FOUND", "ITEM"].includes(error.code)
      )
        return null;
      throw error;
    }
  })();
  if (!result)
    return (
      <p role="alert">
        Este endereço do caderno aponta para uma página ou missão que não está disponível neste
        perfil.{" "}
        <Link className="underline" href="/caderno">
          Voltar ao início do caderno
        </Link>
      </p>
    );
  const { notes, context } = result;
  const nextParams = new URLSearchParams({ archived: query.archived, q: query.q });
  if (notes.next) nextParams.set("after", notes.next);
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="sol">As ideias ficam melhores com suas palavras</Etiqueta>}
        titulo="Meu caderno de descobertas."
        apoio="Uma hipótese, um desenho descrito, uma explicação que finalmente fez sentido. Este espaço é seu."
      />
      <Notebook
        key={data.profile.id}
        profileId={data.profile.id}
        context={context}
        activeCount={notes.activeCount}
        archivedCount={notes.archivedCount}
        archived={query.archived === "1"}
        search={query.q}
        notes={notes.items.map((n) => ({
          ...n,
          archivedAt: n.archivedAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
      <nav
        aria-label="Páginas do caderno"
        className="mt-5 flex flex-wrap gap-5 font-semibold underline underline-offset-4"
      >
        {query.after && (
          <Link href={`/caderno?${new URLSearchParams({ archived: query.archived, q: query.q })}`}>
            Voltar ao início
          </Link>
        )}
        {notes.next && <Link href={`/caderno?${nextParams}`}>Mais descobertas</Link>}
      </nav>
    </>
  );
}
