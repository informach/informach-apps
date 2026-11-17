import { INFORMACH_CONTACT } from "@informach/config/contact";
import { PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { PedirRevisao } from "@/features/moderacao/components/pedir-revisao";
import { consultarRestricao } from "@/features/moderacao/recurso-service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Acesso e revisão do perfil" };
const data = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export default async function RestricaoDoPerfil({ params }: { params: Promise<{ id: string }> }) {
  const id = PerfilIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const destino = `/conta/perfis/${id.data}/restricao`;
  await paginaDaGestao(destino);
  const situacao = await consultarRestricao(await autorDaFamilia(), id.data).catch(
    (erro: unknown) => {
      if (erro instanceof AppError) {
        if (["PERFIL", "CONTATO"].includes(erro.code)) notFound();
        if (erro.code === "AUTH") redirect(`/entrar?recente=1&next=${encodeURIComponent(destino)}`);
      }
      throw erro;
    },
  );
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-sol">Cuidados do perfil</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Acesso de {situacao.apelido}
      </h1>
      <div className="painel mt-6 p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">
          {situacao.suspenso ? "Acesso suspenso" : "Perfil sem suspensão"}
        </h2>
        <p className="mt-3 text-tinta-suave">
          {situacao.suspenso
            ? "Este perfil está impedido de jogar. O titular do perfil adulto ou o responsável atual pelo menor pode pedir revisão à equipe."
            : "Não há suspensão vigente deste perfil. O direito de jogar também depende do plano, dos cuidados do perfil e do jogo escolhido."}
        </p>
        <p className="mt-3 text-sm text-tinta-suave">
          Esta página mostra os pedidos deste perfil. Informações sobre outras pessoas e suas
          denúncias são protegidas.
        </p>
      </div>
      {situacao.podeRecorrer && (
        <PedirRevisao perfilId={situacao.perfilId} versaoDoPerfil={situacao.versaoDoPerfil} />
      )}
      <section className="mt-8" aria-labelledby="pedidos-de-revisao">
        <h2 id="pedidos-de-revisao" className="font-display text-2xl font-bold">
          Pedidos de revisão
        </h2>
        {situacao.recursos.length === 0 ? (
          <p className="painel mt-4 p-5">Nenhum pedido disponível nesta página.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {situacao.recursos.map((r) => (
              <li className="painel p-5" key={r.protocolo}>
                <h3 className="font-bold">
                  {r.situacao === "aberto" ? "Aguardando análise da equipe" : "Revisão respondida"}
                </h3>
                <p className="mt-2 break-all font-mono text-sm">{r.protocolo}</p>
                <p className="mt-2 text-sm text-tinta-suave">
                  Recebido em {data.format(new Date(r.recebidoEm))} (Brasília).
                </p>
                {r.decisao && (
                  <p className="mt-2 font-semibold">
                    Decisão registrada:{" "}
                    {r.decisao === "manter" ? "manter a suspensão" : "reativar o perfil"}.
                  </p>
                )}
                {r.respondidoEm && (
                  <p className="mt-1 text-sm text-tinta-suave">
                    Respondido em {data.format(new Date(r.respondidoEm))} (Brasília).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-6 text-sm text-tinta-suave">
        Se precisar de ajuda, informe somente seu protocolo ao suporte. Não envie senhas ou códigos
        de acesso.
      </p>
      <a
        href={INFORMACH_CONTACT.directMessageUrl}
        className="mt-2 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Falar com o suporte
      </a>
      <Link href="/conta" className="mt-4 flex min-h-11 items-center font-bold text-ceu underline">
        Voltar à conta
      </Link>
    </div>
  );
}
