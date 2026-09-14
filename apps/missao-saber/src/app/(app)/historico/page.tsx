import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { EmptyProfile } from "@/components/empty-profile";
import type { Tom } from "@/components/ui/chapa";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { learningHistory } from "@/features/learning/service";
import { getCurrentUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

const modes = { mission: "Missão", review: "Revisão", diagnostic: "Diagnóstico", exam: "Simulado" };
/** Cada modo tem um tom próprio, mas o nome sempre aparece escrito junto. */
const tons: Record<keyof typeof modes, Tom> = {
  mission: "verde",
  review: "sol",
  diagnostic: "uva",
  exam: "ceu",
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ antes?: string }>;
}) {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const cursor = params.antes;
  const history = await learningHistory(user.id, data.profile.id, cursor).catch(
    (error: unknown) => {
      if (error instanceof ZodError) notFound();
      throw error;
    },
  );
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="uva">Cada descoberta fica guardada</Etiqueta>}
        titulo="Meu histórico"
        apoio="Retome uma pausa ou releia um percurso concluído."
      />
      {history.items.length === 0 ? (
        <p className="text-tinta-suave">
          Nenhum percurso nesta página.{" "}
          <Link href="/historico" className="font-semibold underline underline-offset-4">
            Voltar ao início
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {history.items.map((session) => (
            <Chapa key={session.id} tom={tons[session.mode]} className="flex flex-col">
              <Etiqueta tom={tons[session.mode]}>
                {modes[session.mode]} · {session.completedAt ? "Concluído" : "Em pausa"}
              </Etiqueta>
              <h2 className="mt-3 font-display text-lg leading-snug font-semibold text-tinta">
                {session.title ?? session.lessonId}
              </h2>
              <p className="mt-1 mb-4 text-sm text-tinta-suave">
                <time dateTime={session.createdAt.toISOString()}>
                  {session.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </time>
              </p>
              <Link
                href={`/missao/${session.id}`}
                className="mt-auto self-start font-display font-semibold text-tinta underline underline-offset-4"
              >
                {session.completedAt ? "Ver percurso" : "Retomar percurso"} →
              </Link>
            </Chapa>
          ))}
        </div>
      )}
      <nav
        className="mt-8 flex flex-wrap items-center justify-between gap-3"
        aria-label="Páginas do histórico"
      >
        {cursor && (
          <Link href="/historico" className="font-semibold underline underline-offset-4">
            Mais recentes
          </Link>
        )}
        {history.next && (
          <Link
            href={`/historico?${new URLSearchParams({ antes: history.next })}`}
            className="ml-auto font-semibold underline underline-offset-4"
          >
            Percursos anteriores →
          </Link>
        )}
      </nav>
    </>
  );
}
