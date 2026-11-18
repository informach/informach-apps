import { ehErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound } from "next/navigation";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { CuidadosDeParticipante } from "@/features/mundos/components/cuidados-de-participante";
import { participantesDoMundo } from "@/features/mundos/participantes-repository";

export const metadata = { title: "Participantes do mundo" };
export default async function Participantes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const jogador = await paginaDoJogador(),
    id = MundoIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const busca = await searchParams,
    cursor = PerfilIdSchema.optional().safeParse(busca.apos);
  if (!cursor.success) notFound();
  const apos = cursor.data;
  const destino = `/participantes/${id.data}`;
  const dados = await participantesDoMundo(
    { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId },
    { mundoId: id.data, ...(apos ? { apos } : {}) },
  ).catch((erro: unknown) => {
    if (ehErroDoRecreio(erro, "NAO_MEMBRO")) notFound();
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-3xl px-4 py-10 sm:px-8">
      <Link
        href={jogador.protegido ? "/aparelho" : `/mundos/${id.data}`}
        className="font-bold text-ceu underline"
      >
        Voltar aos seus mundos
      </Link>
      <h1 className="mt-3 font-display text-4xl font-extrabold">Participantes do mundo</h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        Bloquear, silenciar ou denunciar não exige amizade e não remove membros nem apaga o
        progresso do mundo. Esta lista não informa onde outra pessoa está jogando.
      </p>
      <div className="mt-6 grid max-w-2xl gap-4">
        {dados.participantes.map((p) => (
          <CuidadosDeParticipante
            key={p.perfilId}
            perfilId={jogador.perfil.id}
            participante={p}
            destino={destino}
          />
        ))}
      </div>
      {dados.participantes.length === 0 && (
        <p className="painel mt-6 max-w-2xl p-5">Nenhum outro participante nesta página.</p>
      )}
      <nav className="mt-5 flex gap-4" aria-label="Páginas de participantes">
        {apos && (
          <Link className="rb rb-vazado" href={destino}>
            Início da lista
          </Link>
        )}
        {dados.proximo && (
          <Link className="rb rb-vazado" href={`${destino}?apos=${dados.proximo}`}>
            Mais participantes
          </Link>
        )}
      </nav>
    </main>
  );
}
