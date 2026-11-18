import { PerfilIdSchema } from "@informach/recreio";
import { ConsultaDeConvitesDirigidosSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { RecibosDeConvite } from "@/features/mundos/components/recibos-de-convite";
import { caixaDeConvitesDirigidos } from "@/features/mundos/convites-dirigidos-consulta-repository";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Convites do perfil" };
export default async function ConvitesDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const perfil = PerfilIdSchema.safeParse((await params).id);
  if (!perfil.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/convites`;
  const consulta = ConsultaDeConvitesDirigidosSchema.safeParse(await searchParams);
  if (!consulta.success) notFound();
  await paginaDaGestao(destino);
  const caixa = await caixaDeConvitesDirigidos(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
    consulta.data,
  ).catch((erro: unknown) => {
    if (erro instanceof AppError && ["PERFIL", "PEDIDO", "CONTATO"].includes(erro.code)) notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link
        href={`/conta/perfis/${perfil.data}/supervisao`}
        className="font-bold text-ceu underline"
      >
        Voltar à supervisão
      </Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-widest text-sol">
        Companhias de jogo
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
        Convites do perfil
      </h1>
      <p className="mt-4 max-w-2xl text-tinta-suave">
        Confira quem convida antes de autorizar uma participação. A aprovação de amizade e a
        autorização do mundo continuam sendo confirmações separadas.
      </p>
      <RecibosDeConvite caixa={caixa} destino={destino} perfilSobCuidados={perfil.data} />
    </>
  );
}
