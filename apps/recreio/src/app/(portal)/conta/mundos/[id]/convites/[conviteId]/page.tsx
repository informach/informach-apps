import { ehErroDoRecreio, MundoIdSchema, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AprovarConviteDirigido } from "@/features/mundos/components/aprovar-convite-dirigido";
import { painelDoConviteNoMundo } from "@/features/mundos/convites-dirigidos-painel-repository";
import { autorDaResponsabilidade } from "@/features/mundos/responsabilidade-autor";
import { paginaDoPortal } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Entrada no mundo" };
export default async function ConferirEntradaNoMundo({
  params,
}: {
  params: Promise<{ id: string; conviteId: string }>;
}) {
  const p = await params,
    mundo = MundoIdSchema.safeParse(p.id),
    convite = UuidSchema.safeParse(p.conviteId);
  if (!mundo.success || !convite.success) notFound();
  const voltar = `/conta/mundos/${mundo.data}/gestao`;
  await paginaDoPortal(`/conta/mundos/${mundo.data}/convites/${convite.data}`);
  const painel = await painelDoConviteNoMundo(
    await autorDaResponsabilidade(),
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
        Gestão do mundo
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Conferir entrada</h1>
      {painel ? (
        <AprovarConviteDirigido painel={painel} contexto={{ tipo: "mundo" }} voltar={voltar} />
      ) : (
        <p className="painel mt-6 max-w-2xl p-6">
          Este convite venceu ou suas permissões mudaram. Volte à gestão e confira a situação atual.
        </p>
      )}
    </>
  );
}
