import Link from "next/link";
import { redirect } from "next/navigation";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { CoberturaDoGrupo } from "@/features/grupo/components/cobertura";
import { ConviteEnviado, ConviteRecebido, NovoConvite } from "@/features/grupo/components/convites";
import { ParticipacaoPropria } from "@/features/grupo/components/participacao";
import { RetirarParticipacao } from "@/features/grupo/components/retirar";
import { convitesEnviados, convitesRecebidos } from "@/features/grupo/convites-service";
import { consultarMinhaParticipacao } from "@/features/grupo/participacao-service";
import { consultarMeuGrupo } from "@/features/grupo/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Cobertura do grupo" };

export default async function GrupoDaConta({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; convite?: string; participacao?: string }>;
}) {
  const { ator } = await paginaDaGestao("/conta/grupo");
  const grupo = await consultarMeuGrupo(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  const [minhaParticipacao, recebidos, enviados] = await Promise.all([
    consultarMinhaParticipacao(ator),
    convitesRecebidos(ator),
    convitesEnviados(ator),
  ]);
  const { salvo, convite, participacao } = await searchParams;
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Cobertura do grupo</h1>
      <p className="mt-3 text-tinta-suave">
        Você administra as vagas sem precisar jogar. Cada pessoa conserva seu perfil e seu
        progresso.
      </p>
      {salvo === "1" && (
        <p role="status" className="painel mt-6 p-4 font-semibold">
          Cobertura confirmada. Confira abaixo a seleção atual.
        </p>
      )}
      {(["criado", "aceito", "encerrado"].includes(convite ?? "") ||
        ["encerrada", "propria"].includes(participacao ?? "")) && (
        <p role="status" className="painel mt-6 p-4 font-semibold">
          Pedido confirmado. Confira abaixo o estado atual.
        </p>
      )}
      {grupo ? (
        <>
          <p className="mt-6 text-lg font-semibold">
            {grupo.limite > 0
              ? `A cobertura atual permite ${grupo.limite} ${grupo.limite === 1 ? "jogador" : "jogadores"}.`
              : "Sem cobertura para jogar neste momento. Os perfis continuam guardados."}
          </p>
          {grupo.perfis.length > 0 ? (
            <CoberturaDoGrupo grupo={grupo} novasCoberturas={novosPerfisProtegidosDisponiveis} />
          ) : (
            <p className="painel mt-6 p-5">Nenhum jogador cadastrado neste grupo.</p>
          )}
        </>
      ) : (
        <p className="painel mt-6 p-5">Você ainda não tem um grupo de jogadores.</p>
      )}
      {minhaParticipacao && (
        <ParticipacaoPropria
          participacao={minhaParticipacao}
          novasCoberturas={novosPerfisProtegidosDisponiveis}
        />
      )}
      {recebidos.length > 0 && (
        <section aria-labelledby="convites-recebidos" className="mt-8">
          <h2 id="convites-recebidos" className="font-display text-2xl font-bold">
            Convites recebidos
          </h2>
          {recebidos.map((c) => (
            <ConviteRecebido
              key={c.conviteId}
              convite={c}
              participacao={minhaParticipacao}
              disponivel={novosPerfisProtegidosDisponiveis}
            />
          ))}
        </section>
      )}
      {novosPerfisProtegidosDisponiveis ? (
        <NovoConvite nomeInicial={minhaParticipacao?.apelido ?? ""} />
      ) : (
        <p className="mt-6 text-sm text-tinta-suave">
          Novos convites e coberturas ainda não estão disponíveis neste acesso.
        </p>
      )}
      {enviados.length > 0 && (
        <section aria-labelledby="convites-enviados" className="mt-8">
          <h2 id="convites-enviados" className="font-display text-2xl font-bold">
            Convites enviados
          </h2>
          {enviados.map((c) => (
            <ConviteEnviado key={c.conviteId} convite={c} />
          ))}
        </section>
      )}
      {grupo?.perfis.some((p) => p.tipo === "adult") && (
        <section aria-labelledby="participantes-adultos" className="mt-8">
          <h2 id="participantes-adultos" className="font-display text-2xl font-bold">
            Participações de adultos
          </h2>
          <p className="mt-3 text-sm text-tinta-suave">
            Retirar participação é diferente de retirar uma vaga. Cada adulto conserva seu perfil,
            seus dados e seus mundos.
          </p>
          {grupo.perfis
            .filter((p) => p.tipo === "adult")
            .map((p) => (
              <RetirarParticipacao key={p.perfilId} grupoId={grupo.grupoId} perfil={p} />
            ))}
        </section>
      )}
      <nav aria-label="Gestão do grupo" className="mt-8 flex flex-wrap gap-5">
        <Link href="/conta/perfis" className="font-bold text-ceu underline">
          Perfis sob sua responsabilidade
        </Link>
        <Link href="/conta" className="font-bold text-ceu underline">
          Voltar à conta
        </Link>
      </nav>
    </div>
  );
}
