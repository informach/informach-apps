import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import { ConsultaDeConvitesDirigidosSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { painelDeGestaoComConvites } from "@/features/mundos/administracao-painel-repository";
import { AdministracaoDoMundo } from "@/features/mundos/components/administracao";
import { FilaDeConvitesDoMundo } from "@/features/mundos/components/fila-de-convites";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Gestão do mundo do perfil" };
export default async function GestaoDoMundoDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mundoId: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const entrada = await params,
    perfil = PerfilIdSchema.safeParse(entrada.id),
    mundo = MundoIdSchema.safeParse(entrada.mundoId);
  if (!perfil.success || !mundo.success) notFound();
  const consulta = ConsultaDeConvitesDirigidosSchema.safeParse(await searchParams);
  if (!consulta.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/mundos/${mundo.data}/gestao`;
  await paginaDaGestao(destino);
  const painel = await painelDeGestaoComConvites(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
    mundo.data,
    consulta.data,
  ).catch((erro: unknown) => {
    if (
      erro instanceof AppError &&
      ["PERFIL", "MUNDO", "CONTATO", "RESPONSAVEL"].includes(erro.code)
    )
      notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link href={`/conta/perfis/${perfil.data}/mundos`} className="font-bold text-ceu underline">
        Mundos do perfil
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        {painel.mundo.nome}
      </h1>
      <p className="mt-3 text-tinta-suave">
        Gestão do mundo · {painel.mundo.estado === "archived" ? "Arquivado" : "Disponível"}
      </p>
      <AdministracaoDoMundo painel={painel} />
      <Link
        href={`/conta/perfis/${perfil.data}/mundos/${mundo.data}/responsabilidade`}
        className="mt-5 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Transferir responsabilidade pelo mundo
      </Link>
      <FilaDeConvitesDoMundo
        fila={painel.filaDeConvites}
        baseDoConvite={`/conta/perfis/${perfil.data}/mundos/${mundo.data}/convites`}
        gestao={destino}
      />
    </>
  );
}
