import { ehErroDoRecreio, UuidSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound } from "next/navigation";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { DecisaoDaVisita } from "@/features/visitas/components/decisao-do-jogador";
import { consultarReciboDeVisita } from "@/features/visitas/consulta-repository";
import { conferirConviteDeVisita } from "@/features/visitas/detalhe-repository";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Conferir visita" };
export default async function ConferirVisita({
  params,
}: {
  params: Promise<{ conviteId: string }>;
}) {
  const id = UuidSchema.safeParse((await params).conviteId);
  if (!id.success) notFound();
  const jogador = await paginaDoJogador(`/visitas/${id.data}`),
    autor = { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId };
  const recibo = await consultarReciboDeVisita(autor, id.data).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "PEDIDO") notFound();
    throw erro;
  });
  const detalhe = await conferirConviteDeVisita(autor, id.data).catch((erro: unknown) => {
    if (erro instanceof AppError && ["PEDIDO", "CONTATO", "CONFLITO"].includes(erro.code))
      return null;
    if (
      ehErroDoRecreio(erro) &&
      [
        "SESSAO_ENCERRADA",
        "SESSAO_INVALIDA",
        "ACESSO_NEGADO",
        "ACESSO_PERDIDO",
        "POSSE_PERDIDA",
        "INDISPONIVEL",
        "POLITICA_INCOMPATIVEL",
      ].includes(erro.codigo)
    )
      return null;
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <Link
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
        href="/visitas"
      >
        Voltar às visitas
      </Link>
      <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight">Conferir visita</h1>
      {detalhe ? (
        <DecisaoDaVisita
          key={jogador.perfil.id}
          perfilId={jogador.perfil.id}
          detalhe={detalhe}
          direcao={detalhe.direcao}
        />
      ) : (
        <div className="painel mt-7 grid gap-4 p-6">
          <p>
            Esta visita terminou, aguarda novas permissões ou o anfitrião está indisponível. O
            recibo continua na sua lista.
          </p>
          <p className="text-sm text-tinta-suave">
            Situação registrada:{" "}
            {recibo.convite.estado === "accepted"
              ? "convite aceito"
              : "convite concluído ou pendente"}
            .
          </p>
        </div>
      )}
    </main>
  );
}
