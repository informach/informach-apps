import { ehErroDoRecreio, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AprovarVisita } from "@/features/visitas/components/aprovar-visita";
import { painelDaVisitaDoMenor } from "@/features/visitas/painel-nativo-repository";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Autorizar visita" };
export default async function AutorizarVisita({
  params,
}: {
  params: Promise<{ id: string; conviteId: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!perfil.success || !convite.success) notFound();
  const voltar = `/conta/perfis/${perfil.data}/visitas`;
  await paginaDaGestao(`${voltar}/${convite.data}`);
  const painel = await painelDaVisitaDoMenor(
    await autorDaFamilia(),
    perfil.data,
    convite.data,
  ).catch((erro: unknown) => {
    if (erro instanceof AppError && ["PERFIL", "PEDIDO", "CONTATO", "CONFLITO"].includes(erro.code))
      return null;
    if (
      ehErroDoRecreio(erro) &&
      [
        "JOGO_INDISPONIVEL",
        "INDISPONIVEL",
        "SESSAO_ENCERRADA",
        "SESSAO_INVALIDA",
        "ACESSO_NEGADO",
        "ACESSO_PERDIDO",
        "POSSE_PERDIDA",
        "POLITICA_INCOMPATIVEL",
      ].includes(erro.codigo)
    )
      return null;
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        href={voltar}
      >
        Visitas do perfil
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Autorizar visita</h1>
      {painel ? (
        <AprovarVisita
          painel={painel}
          contexto={{ tipo: "responsavel", perfilId: perfil.data }}
          voltar={voltar}
        />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite terminou, o anfitrião saiu ou as permissões mudaram. Volte à lista para
          conferir ou encerrar o convite.
        </p>
      )}
    </>
  );
}
