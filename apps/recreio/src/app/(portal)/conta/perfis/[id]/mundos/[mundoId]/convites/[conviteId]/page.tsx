import { ehErroDoRecreio, MundoIdSchema, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { AprovarConviteDirigido } from "@/features/mundos/components/aprovar-convite-dirigido";
import { painelDoConviteNoMundo } from "@/features/mundos/convites-dirigidos-painel-repository";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Entrada no mundo do perfil" };
export default async function ConferirEntradaNoMundoDoPerfil({
  params,
}: {
  params: Promise<{ id: string; mundoId: string; conviteId: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    mundo = MundoIdSchema.safeParse(p.mundoId),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!perfil.success || !mundo.success || !convite.success) notFound();
  const voltar = `/conta/perfis/${perfil.data}/mundos/${mundo.data}/gestao`;
  await paginaDaGestao(
    `/conta/perfis/${perfil.data}/mundos/${mundo.data}/convites/${convite.data}`,
  );
  const painel = await painelDoConviteNoMundo(
    { responsavel: await autorDaFamilia(), perfilId: perfil.data },
    mundo.data,
    convite.data,
  ).catch((erro: unknown) => {
    if (ehErroDoRecreio(erro, "JOGO_INDISPONIVEL") || ehErroDoRecreio(erro, "CONVITE_INVALIDO"))
      return null;
    if (
      erro instanceof AppError &&
      ["MUNDO", "PERFIL", "PEDIDO", "CONTATO", "CONFLITO", "RESPONSAVEL"].includes(erro.code)
    )
      return null;
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link href={voltar} className="font-bold text-ceu underline">
        Gestão do mundo do perfil
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Conferir entrada</h1>
      {painel ? (
        <AprovarConviteDirigido
          painel={painel}
          contexto={{ tipo: "mundo", perfilId: perfil.data }}
          voltar={voltar}
        />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite venceu ou suas permissões mudaram. Volte à gestão e confira a situação atual.
        </p>
      )}
    </>
  );
}
