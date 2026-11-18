import { ehErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { CuidadosDeParticipante } from "@/features/mundos/components/cuidados-de-participante";
import { participantesDoMundo } from "@/features/mundos/participantes-repository";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Proteção nos mundos do perfil" };
export default async function ParticipantesDoMenor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mundoId: string }>;
  searchParams: Promise<{ apos?: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    mundo = MundoIdSchema.safeParse(p.mundoId),
    cursor = PerfilIdSchema.optional().safeParse((await searchParams).apos);
  if (!perfil.success || !mundo.success || !cursor.success) notFound();
  const volta = `/conta/perfis/${perfil.data}/mundos`,
    destino = `${volta}/${mundo.data}/participantes`;
  await paginaDaGestao(destino);
  const dados = await participantesDoMundo(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
    { mundoId: mundo.data, ...(cursor.data ? { apos: cursor.data } : {}) },
  ).catch((erro: unknown) => {
    if (
      ehErroDoRecreio(erro, "NAO_MEMBRO") ||
      (erro instanceof AppError && ["PEDIDO", "CONTATO"].includes(erro.code))
    )
      notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <Link href={volta} className="font-bold text-ceu underline">
        Mundos do perfil
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold">Proteção nos mundos do perfil</h1>
      <p className="mt-4 text-tinta-suave">
        Você age como responsável atual por este perfil. Bloquear, silenciar ou denunciar não remove
        participantes nem apaga progresso. A gestão do mundo continua com quem é responsável por
        ele.
      </p>
      <div className="mt-6 grid gap-4">
        {dados.participantes.map((p) => (
          <CuidadosDeParticipante
            key={p.perfilId}
            perfilId={perfil.data}
            participante={p}
            destino={destino}
            responsavel
          />
        ))}
      </div>
      {dados.participantes.length === 0 && (
        <p className="painel mt-6 p-5">Nenhum outro participante nesta página.</p>
      )}
      <nav className="mt-5 flex gap-4" aria-label="Páginas de participantes">
        {cursor.data && (
          <Link href={destino} className="rb rb-vazado">
            Primeira página
          </Link>
        )}
        {dados.proximo && (
          <Link href={`${destino}?apos=${dados.proximo}`} className="rb rb-vazado">
            Mais participantes
          </Link>
        )}
      </nav>
    </div>
  );
}
