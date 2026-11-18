import { MundoIdSchema } from "@informach/recreio";
import { ConsultaDeConvitesDirigidosSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { painelDeGestaoComConvites } from "@/features/mundos/administracao-painel-repository";
import { AdministracaoDoMundo } from "@/features/mundos/components/administracao";
import { FilaDeConvitesDoMundo } from "@/features/mundos/components/fila-de-convites";
import { autorDaResponsabilidade } from "@/features/mundos/responsabilidade-autor";
import { paginaDoPortal } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Gestão do mundo" };
export default async function GestaoDoMundo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const id = MundoIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const consulta = ConsultaDeConvitesDirigidosSchema.safeParse(await searchParams);
  if (!consulta.success) notFound();
  await paginaDoPortal(`/conta/mundos/${id.data}/gestao`);
  const painel = await (async () => {
    try {
      return await painelDeGestaoComConvites(
        await autorDaResponsabilidade(),
        id.data,
        consulta.data,
      );
    } catch (erro) {
      if (erro instanceof AppError && ["MUNDO", "RESPONSAVEL", "CONTATO"].includes(erro.code))
        notFound();
      if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
      throw erro;
    }
  })();
  return (
    <>
      <Link href="/conta/mundos" className="font-bold text-ceu underline">
        Participações em mundos
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        {painel.mundo.nome}
      </h1>
      <p className="mt-3 text-tinta-suave">
        Gestão do mundo · {painel.mundo.estado === "archived" ? "Arquivado" : "Disponível"}
      </p>
      <AdministracaoDoMundo painel={painel} />
      <FilaDeConvitesDoMundo
        fila={painel.filaDeConvites}
        baseDoConvite={`/conta/mundos/${id.data}/convites`}
        gestao={`/conta/mundos/${id.data}/gestao`}
      />
    </>
  );
}
