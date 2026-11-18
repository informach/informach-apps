import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import { ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { paginaDaGestao } from "@/features/sessao/ator";
import { FilaDeVisitasDoMundo } from "@/features/visitas/components/fila-do-mundo";
import { visitasAguardandoOMundo } from "@/features/visitas/fila-nativa-repository";
import { painelDeVisitaIndisponivel } from "@/features/visitas/pagina-http";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Visitas ao mundo do perfil" };
export default async function VisitasAoMundoDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mundoId: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    mundo = MundoIdSchema.safeParse(p.mundoId),
    consulta = ConsultaDeVisitasSchema.safeParse(await searchParams);
  if (!perfil.success || !mundo.success || !consulta.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/mundos/${mundo.data}/visitas`;
  await paginaDaGestao(destino);
  const fila = await visitasAguardandoOMundo(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
    mundo.data,
    consulta.data,
  ).catch((erro: unknown) => {
    if (painelDeVisitaIndisponivel(erro)) notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={`/conta/perfis/${perfil.data}/mundos/${mundo.data}/gestao`}
      >
        Gestão do mundo do perfil
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Visitas a {fila.mundo.nome}
      </h1>
      <FilaDeVisitasDoMundo fila={fila} destino={destino} />
    </>
  );
}
