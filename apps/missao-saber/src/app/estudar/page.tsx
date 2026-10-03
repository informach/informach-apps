import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { getProfiles } from "@/features/learning/repository";
import { ConnectStudy, EnterStudy } from "@/features/study-access/components";
import { ContextBoundary } from "@/features/study-access/context-boundary";
import { safeDestination } from "@/features/study-access/policy";
import { getStudyIdentity } from "@/features/study-access/server";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Entrar para estudar" };
export default async function StudyEntry({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; perfil?: string; conexao?: string }>;
}) {
  const params = await searchParams;
  const next = safeDestination(params.next, "study");
  const [user, identity] = await Promise.all([getCurrentUser(), getStudyIdentity()]);
  if (!user && identity) redirect(next);
  const profiles = user?.emailVerified ? await getProfiles(user.id) : [];
  return (
    <main id="conteudo" className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <ContextBoundary />
      <Brand />
      <header className="mt-9 mb-7">
        <p className="text-sm font-semibold text-tinta-suave">
          {user?.emailVerified ? "Passar para o estudante" : "Área de estudo"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-tinta">
          {user?.emailVerified ? "Vamos começar o estudo?" : "Seu próximo passo começa aqui."}
        </h1>
      </header>
      {params.conexao === "encerrada" && !identity && (
        <p role="status" className="mb-5 rounded-card border border-sombra bg-creme p-4 text-sm">
          Esta conexão de estudo terminou ou foi encerrada pelo responsável. Peça uma nova conexão
          para continuar; as respostas confirmadas permanecem na conta.
        </p>
      )}
      <section className="rounded-card border border-sombra bg-creme p-5 sm:p-8">
        {user?.emailVerified ? (
          profiles.length ? (
            <EnterStudy
              profiles={profiles}
              selected={profiles.find((profile) => profile.id === params.perfil)?.id}
              next={next}
            />
          ) : (
            <>
              <p className="mb-5">Primeiro, prepare o perfil de quem vai estudar.</p>
              <LinkChapa href="/familia/preparar">Preparar o estudo</LinkChapa>
            </>
          )
        ) : (
          <ConnectStudy next={next} />
        )}
      </section>
      <div className="mt-6 space-y-3 text-sm text-tinta-suave">
        {user?.emailVerified ? (
          <Link
            href="/familia"
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            Voltar à área do responsável
          </Link>
        ) : (
          <>
            <p>Está com o responsável? Ele pode entrar e abrir seu estudo neste aparelho.</p>
            <LinkChapa
              href={`/entrar?next=${encodeURIComponent(`/estudar?next=${encodeURIComponent(next)}`)}`}
              tom="contorno"
            >
              Entrar como responsável
            </LinkChapa>
          </>
        )}
      </div>
    </main>
  );
}
