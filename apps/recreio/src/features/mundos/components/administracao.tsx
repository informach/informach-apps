"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import { administrarMundoAction } from "../administracao-actions";
import type { painelDeAdministracaoDoMundo } from "../administracao-painel-repository";

type Painel = Awaited<ReturnType<typeof painelDeAdministracaoDoMundo>>;
const PAPEIS = { steward: "Responsável", coadmin: "Coadministrador", member: "Membro" };
const CAMPO = "mt-2 min-h-11 w-full rounded-controle border border-linha bg-fundo px-3 text-tinta";

export function AdministracaoDoMundo({ painel }: { painel: Painel }) {
  const pronto = useHydrated(),
    [pendente, iniciar] = useTransition();
  const [enviado, definirEnviado] = useState(false),
    [mensagem, definirMensagem] = useState("");
  const [login, exigirLogin] = useState(false),
    [confirmo, definirConfirmo] = useState(false);
  const [acao, escolherAcao] = useState("coadministracao");
  const [membroId, escolherMembro] = useState("");
  const [papel, escolherPapel] = useState("coadmin");
  const [convites, escolherConvites] = useState(painel.membrosConvidam);
  const trava = !pronto || pendente || enviado || !painel.podeAlterar;
  const destino = `/conta/mundos/${painel.mundo.id}/gestao`;
  const consequencia =
    acao === "coadministracao"
      ? "A participação escolhida passa ao papel informado. A partida desse perfil neste mundo será encerrada para atualizar as permissões. Retirar coadmin também cancela seus convites ainda não usados. A responsabilidade e o progresso continuam preservados."
      : acao === "convites"
        ? "Muda a regra para novos convites. Aprovações de proteção infantil continuam obrigatórias e amizade não concede entrada automaticamente."
        : acao === "arquivar"
          ? "O mundo fica fechado para jogar. Convites pendentes são cancelados; membros, fotografias e progresso confirmado permanecem guardados. Todos precisam sair pelo jogo e o servidor precisa encerrar a posse antes desta ação."
          : "O mundo volta a ficar disponível, conservando membros e progresso. Convites cancelados não voltam a valer e cada pessoa continua sujeita ao próprio acesso e às políticas atuais.";
  return (
    <>
      <section className="painel mt-8 max-w-2xl p-5 sm:p-6" aria-label="Participantes e papéis">
        <h2 className="font-display text-2xl font-bold">Quem cuida deste mundo</h2>
        <ul className="mt-4 grid gap-3">
          {painel.participacoes.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap justify-between gap-2 border-b border-linha pb-3"
            >
              <span className="font-semibold [overflow-wrap:anywhere]">{p.apelido}</span>
              <span className="text-sm text-tinta-suave">{PAPEIS[p.papel]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-tinta-suave">
          Coadministrar não transfere responsabilidade, assinatura ou administração da conta de
          outra pessoa.
        </p>
      </section>
      {!painel.podeAlterar ? (
        <p className="painel mt-5 max-w-2xl p-5">
          Você pode acompanhar a gestão. Mudanças de papéis, convites e arquivo dependem do
          responsável atual.
        </p>
      ) : (
        <form
          className="painel mt-5 grid max-w-2xl gap-4 p-5 sm:p-6"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (trava || !confirmo) return;
            definirEnviado(true);
            definirMensagem("");
            exigirLogin(false);
            const base = {
              mundoId: painel.mundo.id,
              versaoDaGestao: painel.revisao,
              operacao: acao,
            };
            const pedido =
              acao === "coadministracao"
                ? { ...base, membroId, papel }
                : acao === "convites"
                  ? { ...base, membrosConvidam: convites }
                  : base;
            iniciar(async () => {
              try {
                const r = await administrarMundoAction(pedido);
                if (r.ok)
                  definirMensagem(
                    r.data.alterou
                      ? "Mudança confirmada e registrada. Atualize a gestão para conferir a situação atual."
                      : "A situação já estava como você pediu. Atualize a gestão para continuar.",
                  );
                else {
                  definirMensagem(r.error);
                  exigirLogin(["AUTH", "LOGIN_RECENTE"].includes(r.code));
                }
              } catch {
                definirMensagem(
                  "Não recebemos a confirmação. Atualize a gestão antes de repetir uma ação.",
                );
              }
            });
          }}
        >
          <h2 className="font-display text-2xl font-bold">Ajustar a gestão</h2>
          <p className="text-sm text-tinta-suave">
            Revisão {painel.revisao}. Confira a consequência antes de confirmar.
          </p>
          <label htmlFor="gestao-acao" className="font-semibold">
            O que você quer fazer?
          </label>
          <select
            id="gestao-acao"
            className={CAMPO}
            value={acao}
            disabled={trava}
            onChange={(e) => {
              escolherAcao(e.target.value);
              definirConfirmo(false);
            }}
          >
            <option value="coadministracao">Alterar coadministrador</option>
            <option value="convites">Configurar convites de membros</option>
            <option value={painel.mundo.estado === "archived" ? "retomar" : "arquivar"}>
              {painel.mundo.estado === "archived" ? "Retomar o mundo" : "Arquivar o mundo"}
            </option>
          </select>
          {acao === "coadministracao" && (
            <>
              <label htmlFor="gestao-membro" className="font-semibold">
                Participante adulto
              </label>
              <select
                id="gestao-membro"
                className={CAMPO}
                required
                value={membroId}
                disabled={trava}
                onChange={(e) => {
                  escolherMembro(e.target.value);
                  definirConfirmo(false);
                }}
              >
                <option value="">Escolha uma pessoa</option>
                {painel.participacoes
                  .filter((p) => p.podeCoadministrar)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.apelido}
                    </option>
                  ))}
              </select>
              <label htmlFor="gestao-papel" className="font-semibold">
                Papel no mundo
              </label>
              <select
                id="gestao-papel"
                className={CAMPO}
                value={papel}
                disabled={trava}
                onChange={(e) => {
                  escolherPapel(e.target.value);
                  definirConfirmo(false);
                }}
              >
                <option value="coadmin">Coadministrador</option>
                <option value="member">Membro</option>
              </select>
            </>
          )}
          {acao === "convites" && (
            <>
              <label htmlFor="gestao-convites" className="font-semibold">
                Membros podem convidar?
              </label>
              <select
                id="gestao-convites"
                className={CAMPO}
                value={convites}
                disabled={trava}
                onChange={(e) => {
                  const opcao = (["no", "with_approval", "yes"] as const).find(
                    (v) => v === e.target.value,
                  );
                  if (opcao) {
                    escolherConvites(opcao);
                    definirConfirmo(false);
                  }
                }}
              >
                <option value="no">Só responsável e coadministradores</option>
                <option value="with_approval">Com aprovação da gestão do mundo</option>
                <option value="yes">Direto para a própria participação ou visita</option>
              </select>
            </>
          )}
          <p className="rounded-controle border border-linha bg-fundo p-4 text-sm text-tinta-suave">
            {consequencia}
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              disabled={trava}
              checked={confirmo}
              onChange={(e) => definirConfirmo(e.target.checked)}
            />
            Conferi a pessoa, a revisão e a consequência desta mudança.
          </label>
          <button type="submit" className="rb rb-sol" disabled={trava || !confirmo}>
            {pendente ? "Confirmando…" : "Confirmar mudança no mundo"}
          </button>
        </form>
      )}
      {mensagem && (
        <p role="status" className="mt-5 max-w-2xl font-semibold">
          {mensagem}
        </p>
      )}
      <a
        href={login ? `/entrar?recente=1&next=${encodeURIComponent(destino)}` : destino}
        className="mt-4 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        {login ? "Entrar novamente para confirmar" : "Atualizar gestão do mundo"}
      </a>
    </>
  );
}
