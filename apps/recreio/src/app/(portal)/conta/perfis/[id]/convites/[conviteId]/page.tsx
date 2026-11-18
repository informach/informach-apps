import { ehErroDoRecreio, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { AprovarConviteDirigido } from "@/features/mundos/components/aprovar-convite-dirigido";
import { painelDoConviteDoMenor } from "@/features/mundos/convites-dirigidos-painel-repository";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Conferir convite" };
export default async function ConferirConviteDoPerfil({
  params,
}: {
  params: Promise<{ id: string; conviteId: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!perfil.success || !convite.success) notFound();
  const voltar = `/conta/perfis/${perfil.data}/convites`;
  await paginaDaGestao(`${voltar}/${convite.data}`);
  const painel = await painelDoConviteDoMenor(
    await autorDaFamilia(),
    perfil.data,
    convite.data,
  ).catch((erro: unknown) => {
    if (ehErroDoRecreio(erro, "JOGO_INDISPONIVEL") || ehErroDoRecreio(erro, "CONVITE_INVALIDO"))
      return null;
    if (erro instanceof AppError && ["PERFIL", "PEDIDO", "CONTATO", "CONFLITO"].includes(erro.code))
      return null;
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link href={voltar} className="font-bold text-ceu underline">
        Convites do perfil
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">
        Conferir participação
      </h1>
      {painel ? (
        <AprovarConviteDirigido
          painel={painel}
          contexto={{ tipo: "responsavel", perfilId: perfil.data }}
          voltar={voltar}
        />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite venceu ou suas permissões mudaram. Volte à lista e confira a situação atual.
          Uma participação nova precisa de outro convite.
        </p>
      )}
    </>
  );
}
