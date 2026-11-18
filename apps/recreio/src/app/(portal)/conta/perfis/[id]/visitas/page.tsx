import { PerfilIdSchema } from "@informach/recreio";
import { ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { paginaDaGestao } from "@/features/sessao/ator";
import { RecibosDeVisita } from "@/features/visitas/components/recibos-de-visita";
import { caixaDeVisitas } from "@/features/visitas/consulta-repository";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Visitas do perfil" };
export default async function VisitasDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const perfil = PerfilIdSchema.safeParse((await params).id),
    consulta = ConsultaDeVisitasSchema.safeParse(await searchParams);
  if (!perfil.success || !consulta.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/visitas`;
  await paginaDaGestao(destino);
  const caixa = await caixaDeVisitas(
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
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={`/conta/perfis/${perfil.data}/supervisao`}
      >
        Voltar à supervisão
      </Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-widest text-sol">
        Encontro com amigos
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
        Visitas do perfil
      </h1>
      <p className="mt-4 max-w-2xl text-tinta-suave">
        Confira quem convida antes de autorizar. A visita depende da presença do anfitrião; sua
        aprovação é separada da decisão do mundo. Encerrar continua disponível se a presença ou o
        plano terminar.
      </p>
      <RecibosDeVisita caixa={caixa} destino={destino} perfilSobCuidados={perfil.data} />
    </>
  );
}
