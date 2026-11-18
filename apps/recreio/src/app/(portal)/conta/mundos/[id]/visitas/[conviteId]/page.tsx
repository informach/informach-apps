import { MundoIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaResponsabilidade } from "@/features/mundos/responsabilidade-autor";
import { paginaDoPortal } from "@/features/sessao/ator";
import { AprovarVisita } from "@/features/visitas/components/aprovar-visita";
import { painelDeVisitaIndisponivel } from "@/features/visitas/pagina-http";
import { painelDaVisitaNoMundo } from "@/features/visitas/painel-nativo-repository";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Autorizar visita ao mundo" };
export default async function AutorizarVisitaAoMundo({
  params,
}: {
  params: Promise<{ id: string; conviteId: string }>;
}) {
  const p = await params,
    mundo = MundoIdSchema.safeParse(p.id),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!mundo.success || !convite.success) notFound();
  const voltar = `/conta/mundos/${mundo.data}/visitas`;
  await paginaDoPortal(`${voltar}/${convite.data}`);
  const painel = await painelDaVisitaNoMundo(
    await autorDaResponsabilidade(),
    mundo.data,
    convite.data,
  ).catch((erro: unknown) => {
    if (painelDeVisitaIndisponivel(erro)) return null;
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={voltar}
      >
        Visitas ao mundo
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Autorizar visita</h1>
      {painel ? (
        <AprovarVisita painel={painel} contexto={{ tipo: "mundo" }} voltar={voltar} />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite terminou, o anfitrião saiu ou as permissões mudaram. Volte à lista para
          conferir a situação.
        </p>
      )}
    </>
  );
}
