import { MundoIdSchema, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AprovarVisita } from "@/features/visitas/components/aprovar-visita";
import { painelDeVisitaIndisponivel } from "@/features/visitas/pagina-http";
import { painelDaVisitaNoMundo } from "@/features/visitas/painel-nativo-repository";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Autorizar visita ao mundo do perfil" };
export default async function AutorizarVisitaAoMundoDoPerfil({
  params,
}: {
  params: Promise<{ id: string; mundoId: string; conviteId: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    mundo = MundoIdSchema.safeParse(p.mundoId),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!perfil.success || !mundo.success || !convite.success) notFound();
  const voltar = `/conta/perfis/${perfil.data}/mundos/${mundo.data}/visitas`;
  await paginaDaGestao(`${voltar}/${convite.data}`);
  const painel = await painelDaVisitaNoMundo(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
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
        Visitas ao mundo do perfil
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Autorizar visita</h1>
      {painel ? (
        <AprovarVisita
          painel={painel}
          contexto={{ tipo: "mundo", perfilId: perfil.data }}
          voltar={voltar}
        />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite terminou, o anfitrião saiu ou as permissões mudaram. Volte à lista para
          conferir a situação.
        </p>
      )}
    </>
  );
}
