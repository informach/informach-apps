import { MundoIdSchema } from "@informach/recreio";
import { ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaResponsabilidade } from "@/features/mundos/responsabilidade-autor";
import { paginaDoPortal } from "@/features/sessao/ator";
import { FilaDeVisitasDoMundo } from "@/features/visitas/components/fila-do-mundo";
import { visitasAguardandoOMundo } from "@/features/visitas/fila-nativa-repository";
import { painelDeVisitaIndisponivel } from "@/features/visitas/pagina-http";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Visitas ao mundo" };
export default async function VisitasAoMundo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const mundo = MundoIdSchema.safeParse((await params).id),
    consulta = ConsultaDeVisitasSchema.safeParse(await searchParams);
  if (!mundo.success || !consulta.success) notFound();
  const destino = `/conta/mundos/${mundo.data}/visitas`;
  await paginaDoPortal(destino);
  const fila = await visitasAguardandoOMundo(
    await autorDaResponsabilidade(),
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
        href={`/conta/mundos/${mundo.data}/gestao`}
      >
        Gestão do mundo
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Visitas a {fila.mundo.nome}
      </h1>
      <FilaDeVisitasDoMundo fila={fila} destino={destino} />
    </>
  );
}
